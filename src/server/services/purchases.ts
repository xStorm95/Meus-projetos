/**
 * Serviço de compras.
 *
 * Fluxo: RASCUNHO → PEDIDO (enviado ao fornecedor) → RECEBIMENTO (entrada de
 * estoque + atualização de custo) → contas a pagar geradas automaticamente.
 * Nenhum pedido é apagado: cancelamento preserva histórico e auditoria.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  financeCategories,
  payables,
  productVariants,
  products,
  purchaseItems,
  purchaseOrders,
  suppliers,
  users,
} from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { d, money } from "../lib/money";
import { addMonthsKey, todayKey } from "../lib/dates";
import { nextSequence, formatCode } from "../lib/sequences";
import { writeAudit } from "../lib/audit";
import { getDefaultWarehouse, moveStock } from "./stock";

export type PurchaseActor = { id: string; name: string };

export type PurchaseItemInput = {
  variantId?: string | null;
  productId?: string | null;
  description: string;
  sku?: string | null;
  quantity: number;
  unitCost: number | string;
};

export async function createPurchaseOrder(
  params: {
    supplierId: string;
    issueDate?: string;
    expectedDate?: string | null;
    items: PurchaseItemInput[];
    discountAmount?: number | string;
    freightAmount?: number | string;
    installments?: number;
    firstDueDate?: string | null;
    notes?: string | null;
    status?: "DRAFT" | "ORDERED";
  },
  actor: PurchaseActor,
) {
  if (!params.items.length) throw new BusinessRuleError("Adicione ao menos um item ao pedido.");

  return db.transaction(async (tx) => {
    const supplierRows = await tx.select().from(suppliers).where(eq(suppliers.id, params.supplierId)).limit(1);
    if (!supplierRows[0]) throw new NotFoundError("Fornecedor");

    const seq = await nextSequence(tx, "purchase");
    const code = await formatCode("PC", seq);

    let subtotal = d(0);
    const prepared = params.items.map((item) => {
      if (item.quantity <= 0) throw new BusinessRuleError("Quantidade deve ser maior que zero.");
      const total = d(item.unitCost).times(item.quantity);
      subtotal = subtotal.plus(total);
      return {
        variantId: item.variantId ?? null,
        productId: item.productId ?? null,
        description: item.description,
        sku: item.sku ?? null,
        quantity: money(item.quantity),
        unitCost: money(item.unitCost),
        total: money(total),
      };
    });

    const discount = d(params.discountAmount ?? 0);
    const freight = d(params.freightAmount ?? 0);
    const total = subtotal.minus(discount).plus(freight);
    if (total.lt(0)) throw new BusinessRuleError("O total do pedido não pode ser negativo.");

    const [order] = await tx
      .insert(purchaseOrders)
      .values({
        code,
        supplierId: params.supplierId,
        userId: actor.id,
        status: params.status ?? "DRAFT",
        issueDate: params.issueDate ?? todayKey(),
        expectedDate: params.expectedDate ?? null,
        subtotal: money(subtotal),
        discountAmount: money(discount),
        freightAmount: money(freight),
        total: money(total),
        installments: Math.max(1, Math.trunc(params.installments ?? 1)),
        firstDueDate: params.firstDueDate ?? null,
        notes: params.notes ?? null,
      })
      .returning();

    for (const item of prepared) {
      await tx.insert(purchaseItems).values({ purchaseOrderId: order.id, ...item });
    }

    await writeAudit(
      {
        userId: actor.id,
        userName: actor.name,
        action: "PURCHASE_CREATE",
        entity: "purchase_order",
        entityId: order.id,
        description: `Pedido de compra ${code} criado (${supplierRows[0].legalName}) — R$ ${money(total)}`,
      },
      tx,
    );

    return order;
  });
}

export async function updatePurchaseOrder(
  id: string,
  params: {
    expectedDate?: string | null;
    items?: PurchaseItemInput[];
    discountAmount?: number | string;
    freightAmount?: number | string;
    installments?: number;
    firstDueDate?: string | null;
    notes?: string | null;
  },
  actor: PurchaseActor,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    const order = rows[0];
    if (!order) throw new NotFoundError("Pedido de compra");
    if (!["DRAFT", "QUOTATION"].includes(order.status)) {
      throw new BusinessRuleError("Somente pedidos em rascunho/cotação podem ser alterados.");
    }

    let subtotal = d(order.subtotal);
    if (params.items) {
      if (!params.items.length) throw new BusinessRuleError("O pedido precisa ter ao menos um item.");
      await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseOrderId, id));
      subtotal = d(0);
      for (const item of params.items) {
        const lineTotal = d(item.unitCost).times(item.quantity);
        subtotal = subtotal.plus(lineTotal);
        await tx.insert(purchaseItems).values({
          purchaseOrderId: id,
          variantId: item.variantId ?? null,
          productId: item.productId ?? null,
          description: item.description,
          sku: item.sku ?? null,
          quantity: money(item.quantity),
          unitCost: money(item.unitCost),
          total: money(lineTotal),
        });
      }
    }

    const discount = d(params.discountAmount ?? order.discountAmount);
    const freight = d(params.freightAmount ?? order.freightAmount);
    const total = subtotal.minus(discount).plus(freight);

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        expectedDate: params.expectedDate !== undefined ? params.expectedDate : order.expectedDate,
        discountAmount: money(discount),
        freightAmount: money(freight),
        subtotal: money(subtotal),
        total: money(total),
        installments: params.installments ?? order.installments,
        firstDueDate: params.firstDueDate !== undefined ? params.firstDueDate : order.firstDueDate,
        notes: params.notes !== undefined ? params.notes : order.notes,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))
      .returning();

    await writeAudit(
      {
        userId: actor.id,
        userName: actor.name,
        action: "PURCHASE_UPDATE",
        entity: "purchase_order",
        entityId: id,
        description: `Pedido ${order.code} atualizado — total R$ ${money(total)}`,
      },
      tx,
    );
    return updated;
  });
}

export async function setPurchaseStatus(
  id: string,
  status: "DRAFT" | "ORDERED" | "CANCELED" | "QUOTATION",
  actor: PurchaseActor,
) {
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  const order = rows[0];
  if (!order) throw new NotFoundError("Pedido de compra");
  if (order.status === "RECEIVED") {
    throw new BusinessRuleError("Pedido já recebido não pode mudar de situação.");
  }
  if (status === "CANCELED" && order.status === "CANCELED") {
    throw new BusinessRuleError("Pedido já está cancelado.");
  }
  const [updated] = await db
    .update(purchaseOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: `PURCHASE_${status}`,
    entity: "purchase_order",
    entityId: id,
    description: `Pedido ${order.code} alterado para ${status}.`,
    before: { status: order.status },
    after: { status },
  });
  return updated;
}

/**
 * Recebe itens do pedido: dá entrada no estoque, atualiza custo das variações,
 * monta contas a pagar (parcelas) e encerra o pedido quando tudo foi recebido.
 */
export async function receivePurchaseOrder(
  params: {
    orderId: string;
    items: Array<{ itemId: string; receivedQty: number; unitCost?: number | string }>;
    createPayables?: boolean;
    firstDueDate?: string;
    installments?: number;
    actor: PurchaseActor;
  },
) {
  return db.transaction(async (tx) => {
    const orderRows = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, params.orderId)).limit(1);
    const order = orderRows[0];
    if (!order) throw new NotFoundError("Pedido de compra");
    if (order.status === "CANCELED") throw new BusinessRuleError("Pedido cancelado não pode ser recebido.");
    if (order.status === "RECEIVED") throw new BusinessRuleError("Pedido já foi recebido integralmente.");

    const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseOrderId, order.id));
    const warehouse = await getDefaultWarehouse(tx);

    let receivedValue = d(0);
    let allReceived = true;

    for (const item of items) {
      const req = params.items.find((i) => i.itemId === item.id);
      const qty = req ? Number(req.receivedQty) : 0;
      const pending = d(item.quantity).minus(d(item.receivedQty));
      if (qty < 0) throw new BusinessRuleError("Quantidade recebida inválida.");
      if (d(qty).gt(pending)) {
        throw new BusinessRuleError(
          `Item ${item.description}: quantidade recebida (${qty}) excede a pendente (${money(pending)}).`,
        );
      }
      if (qty === 0) {
        if (d(item.receivedQty).lt(item.quantity)) allReceived = false;
        continue;
      }

      const unitCost = money(req?.unitCost ?? item.unitCost);
      if (item.variantId) {
        await moveStock(tx, {
          variantId: item.variantId,
          warehouseId: warehouse.id,
          delta: qty,
          type: "PURCHASE",
          referenceType: "PURCHASE",
          referenceId: order.id,
          reason: `Recebimento pedido ${order.code}`,
          unitCost,
          userId: params.actor.id,
          userName: params.actor.name,
        });
        await tx
          .update(productVariants)
          .set({ costPrice: unitCost, updatedAt: new Date() })
          .where(eq(productVariants.id, item.variantId));
        if (item.productId) {
          await tx
            .update(products)
            .set({ costPrice: unitCost, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }
      }

      const newReceived = d(item.receivedQty).plus(qty);
      await tx
        .update(purchaseItems)
        .set({ receivedQty: money(newReceived), unitCost, total: money(d(unitCost).times(item.quantity)) })
        .where(eq(purchaseItems.id, item.id));

      receivedValue = receivedValue.plus(d(unitCost).times(qty));
      if (d(newReceived).lt(item.quantity)) allReceived = false;
    }

    if (receivedValue.lte(0)) throw new BusinessRuleError("Informe a quantidade recebida de ao menos um item.");

    const [updatedOrder] = await tx
      .update(purchaseOrders)
      .set({
        status: allReceived ? "RECEIVED" : "PARTIAL",
        receivedAt: allReceived ? new Date() : order.receivedAt,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, order.id))
      .returning();

    // Contas a pagar automáticas
    let payablesCreated = 0;
    if (params.createPayables !== false) {
      const installments = Math.max(1, Math.trunc(params.installments ?? order.installments ?? 1));
      const firstDue = params.firstDueDate ?? order.firstDueDate ?? todayKey();
      const category = await tx
        .select({ id: financeCategories.id })
        .from(financeCategories)
        .where(eq(financeCategories.name, "Compra de mercadorias"))
        .limit(1);
      const totalToPay = receivedValue;
      const base = d(totalToPay).dividedBy(installments).toDecimalPlaces(2);
      let allocated = d(0);
      for (let i = 0; i < installments; i++) {
        const amount =
          i === installments - 1 ? d(totalToPay).minus(allocated) : base;
        allocated = allocated.plus(amount);
        if (amount.lte(0)) continue;
        await tx.insert(payables).values({
          description: `Compra ${order.code}${installments > 1 ? ` (${i + 1}/${installments})` : ""}`,
          supplierId: order.supplierId,
          categoryId: category[0]?.id ?? null,
          amount: money(amount),
          dueDate: addMonthsKey(firstDue, i),
          installmentNumber: i + 1,
          installmentTotal: installments,
          purchaseOrderId: order.id,
          createdBy: params.actor.id,
          notes: `Gerado automaticamente no recebimento do pedido ${order.code}`,
        });
        payablesCreated += 1;
      }
    }

    await writeAudit(
      {
        userId: params.actor.id,
        userName: params.actor.name,
        action: "PURCHASE_RECEIVE",
        entity: "purchase_order",
        entityId: order.id,
        description: `Recebimento do pedido ${order.code} — R$ ${money(receivedValue)} (${payablesCreated} conta(s) a pagar)`,
      },
      tx,
    );

    return { order: updatedOrder, receivedValue: money(receivedValue), payablesCreated, allReceived };
  });
}

export async function listPurchaseOrders(params: {
  status?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 25);
  const conds = [];
  if (params.status && params.status !== "ALL") conds.push(eq(purchaseOrders.status, params.status as never));
  if (params.supplierId) conds.push(eq(purchaseOrders.supplierId, params.supplierId));
  if (params.from) conds.push(gte(purchaseOrders.issueDate, params.from));
  if (params.to) conds.push(lte(purchaseOrders.issueDate, params.to));
  if (params.search) {
    conds.push(sql`(lower(${purchaseOrders.code}) LIKE ${`%${params.search.toLowerCase()}%`} OR lower(${suppliers.legalName}) LIKE ${`%${params.search.toLowerCase()}%`})`);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        order: purchaseOrders,
        supplierName: suppliers.legalName,
        userName: users.name,
        itemCount: sql<number>`(SELECT COUNT(*)::int FROM purchase_items WHERE purchase_order_id = ${purchaseOrders.id})`,
        pendingQty: sql<string>`(
          SELECT COALESCE(SUM(quantity - received_qty), 0)::text FROM purchase_items
           WHERE purchase_order_id = ${purchaseOrders.id}
        )`,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .leftJoin(users, eq(users.id, purchaseOrders.userId))
      .where(where)
      .orderBy(desc(purchaseOrders.issueDate), desc(purchaseOrders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.status} <> 'CANCELED' THEN ${purchaseOrders.total} ELSE 0 END), 0)::text`,
        open: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.status} IN ('ORDERED','PARTIAL','QUOTATION') THEN ${purchaseOrders.total} ELSE 0 END), 0)::text`,
        received: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.status} = 'RECEIVED' THEN ${purchaseOrders.total} ELSE 0 END), 0)::text`,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where),
  ]);

  return {
    items: items.map((row) => ({
      ...row.order,
      createdAt: row.order.createdAt.toISOString(),
      updatedAt: row.order.updatedAt.toISOString(),
      receivedAt: row.order.receivedAt ? row.order.receivedAt.toISOString() : null,
      supplierName: row.supplierName,
      userName: row.userName,
      itemCount: Number(row.itemCount ?? 0),
      pendingQty: String(row.pendingQty ?? "0"),
    })),
    total: Number(totals[0]?.count ?? 0),
    totals: {
      total: money(totals[0]?.total ?? 0),
      open: money(totals[0]?.open ?? 0),
      received: money(totals[0]?.received ?? 0),
    },
    page,
    pageSize,
  };
}

export async function getPurchaseOrder(id: string) {
  const rows = await db
    .select({
      order: purchaseOrders,
      supplierName: suppliers.legalName,
      supplierDocument: suppliers.document,
      supplierPhone: suppliers.phone,
      userName: users.name,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(users, eq(users.id, purchaseOrders.userId))
    .where(eq(purchaseOrders.id, id))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Pedido de compra");

  const [items, linkedPayables] = await Promise.all([
    db
      .select({
        item: purchaseItems,
        stockQty: productVariants.stockQty,
        colorName: productVariants.colorName,
        sizeName: productVariants.sizeName,
      })
      .from(purchaseItems)
      .leftJoin(productVariants, eq(productVariants.id, purchaseItems.variantId))
      .where(eq(purchaseItems.purchaseOrderId, id))
      .orderBy(asc(purchaseItems.description)),
    db.select().from(payables).where(eq(payables.purchaseOrderId, id)).orderBy(asc(payables.dueDate)),
  ]);

  return {
    ...rows[0].order,
    createdAt: rows[0].order.createdAt.toISOString(),
    updatedAt: rows[0].order.updatedAt.toISOString(),
    receivedAt: rows[0].order.receivedAt ? rows[0].order.receivedAt.toISOString() : null,
    supplierName: rows[0].supplierName,
    supplierDocument: rows[0].supplierDocument,
    supplierPhone: rows[0].supplierPhone,
    userName: rows[0].userName,
    items: items.map((row) => ({
      ...row.item,
      stockQty: row.stockQty,
      colorName: row.colorName,
      sizeName: row.sizeName,
    })),
    payables: linkedPayables.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
  };
}

/** Comparativo de custo por produto/fornecedor (base para cotação). */
export async function priceComparison(params: { productIds?: string[]; search?: string; limit?: number }) {
  const conds = [sql`p.deleted_at IS NULL`];
  if (params.productIds?.length) conds.push(inArray(products.id, params.productIds));
  if (params.search) conds.push(sql`lower(p.name) LIKE ${`%${params.search.toLowerCase()}%`}`);
  const rows = await db.execute(sql`
    SELECT p.id, p.name, p.reference, p.cost_price::text AS current_cost,
           s.id AS supplier_id, s.legal_name,
           MAX(pi.unit_cost)::text AS last_cost,
           MAX(po.issue_date)::text AS last_date
      FROM products p
      LEFT JOIN purchase_items pi ON pi.product_id = p.id
      LEFT JOIN purchase_orders po ON po.id = pi.purchase_order_id AND po.status <> 'CANCELED'
      LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE ${sql.join(conds, sql` AND `)}
     GROUP BY p.id, p.name, p.reference, p.cost_price, s.id, s.legal_name
     ORDER BY p.name ASC
     LIMIT ${params.limit ?? 100}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    productId: String(r.id),
    name: String(r.name),
    reference: String(r.reference),
    currentCost: money(String(r.current_cost ?? 0)),
    supplierId: r.supplier_id ? String(r.supplier_id) : null,
    supplierName: r.legal_name ? String(r.legal_name) : null,
    lastCost: r.last_cost ? money(String(r.last_cost)) : null,
    lastDate: r.last_date ? String(r.last_date) : null,
  }));
}

/** Sugestão de itens para um novo pedido, a partir do estoque baixo. */
export async function purchaseSuggestions(limit = 60) {
  const rows = await db.execute(sql`
    SELECT p.id AS product_id, p.name, p.reference, pv.id AS variant_id, pv.sku,
           pv.color_name, pv.size_name, pv.stock_qty::text, pv.cost_price::text,
           COALESCE(pv.low_stock, p.low_stock, 5) AS low_stock,
           (COALESCE(pv.low_stock, p.low_stock, 5) * 2 - pv.stock_qty)::int AS suggested,
           p.supplier_id, s.legal_name AS supplier_name
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE pv.is_active = true AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
       AND pv.stock_qty <= COALESCE(pv.low_stock, p.low_stock, 5)
     ORDER BY (pv.stock_qty - COALESCE(pv.low_stock, p.low_stock, 5)) ASC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    productId: String(r.product_id),
    name: String(r.name),
    reference: String(r.reference),
    variantId: String(r.variant_id),
    sku: String(r.sku),
    colorName: r.color_name ? String(r.color_name) : null,
    sizeName: r.size_name ? String(r.size_name) : null,
    stockQty: String(r.stock_qty),
    costPrice: String(r.cost_price),
    lowStock: Number(r.low_stock),
    suggested: Math.max(1, Number(r.suggested ?? 1)),
    supplierId: r.supplier_id ? String(r.supplier_id) : null,
    supplierName: r.supplier_name ? String(r.supplier_name) : null,
  }));
}

export async function purchaseStats() {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'ORDERED')::int AS ordered,
      COUNT(*) FILTER (WHERE status IN ('PARTIAL','RECEIVED'))::int AS in_transit,
      COALESCE(SUM(total) FILTER (WHERE status IN ('ORDERED','PARTIAL')), 0)::text AS open_value,
      COUNT(*) FILTER (WHERE status = 'RECEIVED' AND received_at >= now() - interval '30 days')::int AS received_30d,
      COALESCE(SUM(total) FILTER (WHERE status = 'RECEIVED' AND received_at >= now() - interval '30 days'), 0)::text AS received_value_30d
      FROM purchase_orders
  `);
  const r = (rows.rows as Array<Record<string, string | number>>)[0] ?? {};
  return {
    ordered: Number(r.ordered ?? 0),
    inTransit: Number(r.in_transit ?? 0),
    openValue: money(String(r.open_value ?? 0)),
    received30d: Number(r.received_30d ?? 0),
    receivedValue30d: money(String(r.received_value_30d ?? 0)),
  };
}
