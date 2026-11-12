/**
 * Serviço de estoque (camada de consulta e operações em lote).
 * As movimentações unitárias ficam em ./stock (moveStock/adjustStock/createTransfer)
 * e são sempre executadas dentro de transação.
 */
import { and, asc, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  categories,
  colors,
  productVariants,
  products,
  sizes,
  stockCountItems,
  stockCounts,
  stockMovements,
  stockTransferItems,
  stockTransfers,
  users,
  warehouses,
} from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { money, d } from "../lib/money";
import { adjustStock, getDefaultWarehouse, moveStock } from "./stock";
import { writeAudit } from "../lib/audit";
import { nextSequence, formatCode } from "../lib/sequences";
import { addDaysKey, inicioDoDia } from "../lib/dates";

export type StockActor = { id: string; name: string };

/* ============================ CONSULTAS ============================ */

export async function stockOverview() {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE pv.stock_qty > 0)::int                      AS variants_in_stock,
      COUNT(*)::int                                                      AS variants_total,
      COALESCE(SUM(pv.stock_qty), 0)::text                               AS units,
      COALESCE(SUM(pv.stock_qty * pv.cost_price), 0)::text               AS stock_value_cost,
      COALESCE(SUM(pv.stock_qty * pv.sale_price), 0)::text               AS stock_value_sale,
      COUNT(*) FILTER (WHERE pv.stock_qty <= COALESCE(pv.low_stock, p.low_stock, 5) AND pv.stock_qty > 0)::int AS low_stock,
      COUNT(*) FILTER (WHERE pv.stock_qty <= 0)::int                     AS out_of_stock
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
     WHERE pv.is_active = true AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
  `);
  const r = (rows.rows as Array<Record<string, string | number>>)[0] ?? {};
  return {
    variantsInStock: Number(r.variants_in_stock ?? 0),
    variantsTotal: Number(r.variants_total ?? 0),
    units: Number(r.units ?? 0),
    valueCost: money(String(r.stock_value_cost ?? 0)),
    valueSale: money(String(r.stock_value_sale ?? 0)),
    lowStock: Number(r.low_stock ?? 0),
    outOfStock: Number(r.out_of_stock ?? 0),
  };
}

export async function listStockPositions(params: {
  search?: string;
  situation?: "ALL" | "LOW" | "OUT" | "OK";
  categoryId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 50);
  const conds = [sql`p.deleted_at IS NULL AND pv.is_active = true`];
  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    conds.push(
      sql`(lower(p.name) LIKE ${term} OR lower(pv.sku) LIKE ${term} OR p.reference ILIKE ${term} OR pv.barcode = ${params.search})`,
    );
  }
  if (params.categoryId) conds.push(sql`p.category_id = ${params.categoryId}`);
  if (params.situation === "LOW") {
    conds.push(sql`pv.stock_qty > 0 AND pv.stock_qty <= COALESCE(pv.low_stock, p.low_stock, 5)`);
  } else if (params.situation === "OUT") {
    conds.push(sql`pv.stock_qty <= 0`);
  } else if (params.situation === "OK") {
    conds.push(sql`pv.stock_qty > COALESCE(pv.low_stock, p.low_stock, 5)`);
  }
  const where = sql.join(conds, sql` AND `);

  const [rows, totals] = await Promise.all([
    db.execute(sql`
      SELECT pv.id AS variant_id, pv.sku, pv.barcode, pv.color_name, pv.size_name,
             pv.stock_qty::text, pv.reserved_qty::text, pv.cost_price::text, pv.sale_price::text,
             COALESCE(pv.low_stock, p.low_stock, 5) AS low_stock,
             p.id AS product_id, p.name AS product_name, p.reference,
             c.name AS category_name, (pv.stock_qty * pv.cost_price)::text AS value_cost
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       ORDER BY pv.stock_qty ASC, p.name ASC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(pv.stock_qty), 0)::text AS units,
             COALESCE(SUM(pv.stock_qty * pv.cost_price), 0)::text AS value
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
       WHERE ${where}
    `),
  ]);

  const items = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    variantId: String(r.variant_id),
    productId: String(r.product_id),
    productName: String(r.product_name),
    reference: String(r.reference),
    sku: String(r.sku),
    barcode: r.barcode ? String(r.barcode) : null,
    colorName: r.color_name ? String(r.color_name) : null,
    sizeName: r.size_name ? String(r.size_name) : null,
    stockQty: String(r.stock_qty),
    reservedQty: String(r.reserved_qty),
    costPrice: String(r.cost_price),
    salePrice: String(r.sale_price),
    lowStock: Number(r.low_stock ?? 5),
    categoryName: r.category_name ? String(r.category_name) : null,
    valueCost: String(r.value_cost ?? "0"),
  }));

  const t = (totals.rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    items,
    total: Number(t.count ?? 0),
    totals: { units: String(t.units ?? "0"), value: money(String(t.value ?? 0)) },
    page,
    pageSize,
  };
}

export async function listMovements(params: {
  variantId?: string;
  productId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 40);
  const conds = [];
  if (params.variantId) conds.push(eq(stockMovements.variantId, params.variantId));
  if (params.productId) conds.push(eq(stockMovements.productId, params.productId));
  if (params.type && params.type !== "ALL") conds.push(eq(stockMovements.type, params.type as never));
  if (params.from) conds.push(gte(stockMovements.createdAt, inicioDoDia(params.from)));
  if (params.to) conds.push(lt(stockMovements.createdAt, inicioDoDia(addDaysKey(params.to, 1))));
  const where = conds.length ? and(...conds) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        createdAt: stockMovements.createdAt,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        balanceAfter: stockMovements.balanceAfter,
        unitCost: stockMovements.unitCost,
        reason: stockMovements.reason,
        referenceType: stockMovements.referenceType,
        referenceId: stockMovements.referenceId,
        userName: stockMovements.userName,
        sku: productVariants.sku,
        colorName: productVariants.colorName,
        sizeName: productVariants.sizeName,
        productName: products.name,
        warehouseName: warehouses.name,
      })
      .from(stockMovements)
      .leftJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
      .leftJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        entries: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.quantity} > 0 THEN ${stockMovements.quantity} ELSE 0 END), 0)::text`,
        exits: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.quantity} < 0 THEN ${stockMovements.quantity} ELSE 0 END), 0)::text`,
      })
      .from(stockMovements)
      .where(where),
  ]);

  return {
    items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    total: Number(totals[0]?.count ?? 0),
    totals: { entries: String(totals[0]?.entries ?? "0"), exits: String(totals[0]?.exits ?? "0") },
    page,
    pageSize,
  };
}

/* ============================ OPERAÇÕES ============================ */

/** Entrada de mercadoria (compra, devolução de cliente, bonificação). */
export async function registerEntry(params: {
  items: Array<{ variantId: string; quantity: number; unitCost?: number | string }>;
  type: "PURCHASE" | "RETURN" | "OPENING";
  reason: string;
  referenceType?: string;
  referenceId?: string;
  actor: StockActor;
}) {
  if (!params.items.length) throw new BusinessRuleError("Informe ao menos um item.");
  if (!params.reason?.trim()) throw new BusinessRuleError("Informe o motivo/observação da entrada.");

  return db.transaction(async (tx) => {
    const warehouse = await getDefaultWarehouse(tx);
    const results: Array<{ variantId: string; balance: number }> = [];
    for (const item of params.items) {
      if (item.quantity <= 0) throw new BusinessRuleError("A quantidade deve ser maior que zero.");
      const balance = await moveStock(tx, {
        variantId: item.variantId,
        warehouseId: warehouse.id,
        delta: item.quantity,
        type: params.type,
        referenceType: params.referenceType ?? "MANUAL",
        referenceId: params.referenceId,
        reason: params.reason,
        unitCost: item.unitCost !== undefined ? money(item.unitCost) : undefined,
        userId: params.actor.id,
        userName: params.actor.name,
      });
      // Atualiza custo médio simples quando informado (compra)
      if (item.unitCost !== undefined && d(item.unitCost).gt(0)) {
        await tx
          .update(productVariants)
          .set({ costPrice: money(item.unitCost), updatedAt: new Date() })
          .where(eq(productVariants.id, item.variantId));
      }
      results.push({ variantId: item.variantId, balance });
    }
    await writeAudit(
      {
        userId: params.actor.id,
        userName: params.actor.name,
        action: "STOCK_ENTRY",
        entity: "stock_movement",
        description: `Entrada de estoque (${params.type}) — ${results.length} item(ns). ${params.reason}`,
        after: { items: results },
      },
      tx,
    );
    return { movements: results.length };
  });
}

/** Saída manual: perda, avaria, uso interno, doação. */
export async function registerLoss(params: {
  variantId: string;
  quantity: number;
  type: "LOSS" | "DAMAGE";
  reason: string;
  actor: StockActor;
}) {
  if (params.quantity <= 0) throw new BusinessRuleError("A quantidade deve ser maior que zero.");
  if (!params.reason?.trim()) throw new BusinessRuleError("Descreva o motivo da baixa.");

  return db.transaction(async (tx) => {
    const warehouse = await getDefaultWarehouse(tx);
    const balance = await moveStock(tx, {
      variantId: params.variantId,
      warehouseId: warehouse.id,
      delta: -params.quantity,
      type: params.type,
      referenceType: "MANUAL",
      reason: params.reason,
      userId: params.actor.id,
      userName: params.actor.name,
    });
    await writeAudit(
      {
        userId: params.actor.id,
        userName: params.actor.name,
        action: params.type === "LOSS" ? "STOCK_LOSS" : "STOCK_DAMAGE",
        entity: "stock_movement",
        description: `Baixa de ${params.quantity} un. — ${params.reason}`,
        after: { variantId: params.variantId, balance },
      },
      tx,
    );
    return { balance };
  });
}

/** Ajuste direto de saldo (com motivo obrigatório). */
export async function setStockQuantity(params: {
  variantId: string;
  newQuantity: number;
  reason: string;
  actor: StockActor;
}) {
  if (params.newQuantity < 0) throw new BusinessRuleError("O saldo não pode ser negativo.");
  if (!params.reason?.trim()) throw new BusinessRuleError("Informe o motivo do ajuste.");
  return db.transaction(async (tx) => {
    const balance = await adjustStock(tx, {
      variantId: params.variantId,
      newQuantity: params.newQuantity,
      reason: params.reason,
      userId: params.actor.id,
      userName: params.actor.name,
    });
    await writeAudit(
      {
        userId: params.actor.id,
        userName: params.actor.name,
        action: "STOCK_ADJUST",
        entity: "product_variant",
        entityId: params.variantId,
        description: `Ajuste de estoque para ${params.newQuantity} un. — ${params.reason}`,
      },
      tx,
    );
    return { balance };
  });
}

export async function listWarehouses() {
  return db.select().from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.name));
}

export async function transferStock(params: {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ variantId: string; quantity: number }>;
  notes?: string;
  actor: StockActor;
}) {
  const transfer = await (await import("./stock")).createTransfer({
    ...params,
    userId: params.actor.id,
    userName: params.actor.name,
  });
  await writeAudit({
    userId: params.actor.id,
    userName: params.actor.name,
    action: "STOCK_TRANSFER",
    entity: "stock_transfer",
    entityId: transfer.id,
    description: `Transferência ${transfer.code} entre depósitos (${params.items.length} item(ns)).`,
  });
  return transfer;
}

export async function listTransfers(limit = 30) {
  return db
    .select({
      transfer: stockTransfers,
      fromName: sql<string>`(SELECT name FROM warehouses WHERE id = ${stockTransfers.fromWarehouseId})`,
      toName: sql<string>`(SELECT name FROM warehouses WHERE id = ${stockTransfers.toWarehouseId})`,
    })
    .from(stockTransfers)
    .orderBy(desc(stockTransfers.createdAt))
    .limit(limit);
}

/* ============================ INVENTÁRIO ============================ */

export async function startInventory(params: { warehouseId?: string; notes?: string; actor: StockActor }) {
  return db.transaction(async (tx) => {
    const warehouseId = params.warehouseId ?? (await getDefaultWarehouse(tx)).id;
    const open = await tx
      .select()
      .from(stockCounts)
      .where(and(eq(stockCounts.status, "OPEN"), eq(stockCounts.warehouseId, warehouseId)))
      .limit(1);
    if (open[0]) throw new BusinessRuleError("Já existe um inventário em andamento para este depósito.");

    const seq = await nextSequence(tx, "inventory");
    const code = await formatCode("INV", seq);
    const [count] = await tx
      .insert(stockCounts)
      .values({ code, warehouseId, notes: params.notes ?? null, startedBy: params.actor.id })
      .returning();

    // Fotografa o saldo atual de todas as variações ativas com estoque no depósito
    await tx.execute(sql`
      INSERT INTO stock_count_items (count_id, variant_id, expected_qty, counted_qty)
      SELECT ${count.id}, pv.id, COALESCE(sl.quantity, 0), NULL
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN stock_levels sl ON sl.variant_id = pv.id AND sl.warehouse_id = ${warehouseId}
       WHERE pv.is_active = true AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
    `);

    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "INVENTORY_START",
      entity: "stock_count",
      entityId: count.id,
      description: `Inventário ${code} iniciado.`,
    });
    return count;
  });
}

export async function getInventory(countId: string) {
  const rows = await db.select().from(stockCounts).where(eq(stockCounts.id, countId)).limit(1);
  const count = rows[0];
  if (!count) throw new NotFoundError("Inventário");
  const items = await db
    .select({
      id: stockCountItems.id,
      variantId: stockCountItems.variantId,
      expectedQty: stockCountItems.expectedQty,
      countedQty: stockCountItems.countedQty,
      sku: productVariants.sku,
      colorName: productVariants.colorName,
      sizeName: productVariants.sizeName,
      currentQty: productVariants.stockQty,
      costPrice: productVariants.costPrice,
      productName: products.name,
      reference: products.reference,
      categoryName: categories.name,
    })
    .from(stockCountItems)
    .innerJoin(productVariants, eq(productVariants.id, stockCountItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(stockCountItems.countId, countId))
    .orderBy(asc(products.name), asc(productVariants.sizeName));
  return { count, items };
}

/** Salva a contagem (pode ser parcial). */
export async function saveInventoryItems(
  countId: string,
  items: Array<{ variantId: string; countedQty: number | null }>,
) {
  const rows = await db.select().from(stockCounts).where(eq(stockCounts.id, countId)).limit(1);
  if (!rows[0]) throw new NotFoundError("Inventário");
  if (rows[0].status !== "OPEN") throw new BusinessRuleError("Este inventário já foi encerrado.");

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(stockCountItems)
        .set({ countedQty: item.countedQty === null ? null : money(item.countedQty) })
        .where(
          and(eq(stockCountItems.countId, countId), eq(stockCountItems.variantId, item.variantId)),
        );
    }
  });
  return { saved: items.length };
}

export async function closeInventory(params: { countId: string; applyAdjustments?: boolean; actor: StockActor }) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(stockCounts).where(eq(stockCounts.id, params.countId)).limit(1);
    const count = rows[0];
    if (!count) throw new NotFoundError("Inventário");
    if (count.status !== "OPEN") throw new BusinessRuleError("Este inventário já foi encerrado.");

    const applyAdjustments = params.applyAdjustments ?? true;
    let adjusted = 0;

    if (applyAdjustments) {
      const diffs = await tx.execute(sql`
        SELECT variant_id, counted_qty::text, expected_qty::text,
               (counted_qty - expected_qty)::text AS delta
          FROM stock_count_items
         WHERE count_id = ${count.id} AND counted_qty IS NOT NULL AND counted_qty <> expected_qty
      `);
      for (const row of diffs.rows as Array<Record<string, string>>) {
        const delta = Number(row.delta);
        if (!delta) continue;
        await moveStock(tx, {
          variantId: row.variant_id,
          warehouseId: count.warehouseId,
          delta,
          type: "INVENTORY",
          referenceType: "INVENTORY",
          referenceId: count.id,
          reason: `Inventário ${count.code}`,
          userId: params.actor.id,
          userName: params.actor.name,
          allowNegative: true,
        });
        adjusted += 1;
      }
    }

    const [closed] = await tx
      .update(stockCounts)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
        closedBy: params.actor.id,
        applyAdjustments,
      })
      .where(eq(stockCounts.id, count.id))
      .returning();

    await writeAudit(
      {
        userId: params.actor.id,
        userName: params.actor.name,
        action: "INVENTORY_CLOSE",
        entity: "stock_count",
        entityId: count.id,
        description: `Inventário ${count.code} encerrado — ${adjusted} ajuste(s) aplicado(s).`,
      },
      tx,
    );
    return { count: closed, adjusted };
  });
}

export async function listInventories(limit = 20) {
  return db
    .select({
      count: stockCounts,
      warehouseName: warehouses.name,
      startedByName: users.name,
      items: sql<number>`(SELECT COUNT(*)::int FROM stock_count_items WHERE count_id = ${stockCounts.id})`,
      counted: sql<number>`(SELECT COUNT(*)::int FROM stock_count_items WHERE count_id = ${stockCounts.id} AND counted_qty IS NOT NULL)`,
      divergences: sql<number>`(SELECT COUNT(*)::int FROM stock_count_items WHERE count_id = ${stockCounts.id} AND counted_qty IS NOT NULL AND counted_qty <> expected_qty)`,
    })
    .from(stockCounts)
    .leftJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .leftJoin(users, eq(users.id, stockCounts.startedBy))
    .orderBy(desc(stockCounts.startedAt))
    .limit(limit);
}

/** Sugestão de reposição: itens abaixo do mínimo, com sugestão de compra. */
export async function restockSuggestions(limit = 80) {
  const rows = await db.execute(sql`
    SELECT p.id AS product_id, p.name, p.reference, pv.sku, pv.color_name, pv.size_name,
           pv.stock_qty::text, COALESCE(pv.low_stock, p.low_stock, 5) AS low_stock,
           (COALESCE(pv.low_stock, p.low_stock, 5) * 2 - pv.stock_qty)::text AS suggested,
           pv.cost_price::text,
           (SELECT COALESCE(SUM(si.quantity), 0)::int FROM sale_items si
              JOIN sales s ON s.id = si.sale_id
             WHERE si.variant_id = pv.id AND s.status = 'COMPLETED'
               AND s.completed_at >= now() - interval '60 days') AS sold_60d
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
     WHERE pv.is_active = true AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
       AND pv.stock_qty <= COALESCE(pv.low_stock, p.low_stock, 5)
     ORDER BY pv.stock_qty ASC, sold_60d DESC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    productId: String(r.product_id),
    name: String(r.name),
    reference: String(r.reference),
    sku: String(r.sku),
    colorName: r.color_name ? String(r.color_name) : null,
    sizeName: r.size_name ? String(r.size_name) : null,
    stockQty: String(r.stock_qty),
    lowStock: Number(r.low_stock),
    suggested: Math.max(1, Math.ceil(Number(r.suggested ?? 1))),
    costPrice: String(r.cost_price ?? "0"),
    sold60d: Number(r.sold_60d ?? 0),
  }));
}

/** Movimentações de um item (histórico detalhado). */
export async function variantMovementHistory(variantId: string, limit = 60) {
  const rows = await db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      balanceAfter: stockMovements.balanceAfter,
      reason: stockMovements.reason,
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      userName: stockMovements.userName,
    })
    .from(stockMovements)
    .where(eq(stockMovements.variantId, variantId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function catalogOptions() {
  const [cats, whs] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.name)),
    listWarehouses(),
  ]);
  return { categories: cats, warehouses: whs };
}

/** Cache simples de cores/tamanhos para selects auxiliares. */
export async function variantFilters() {
  const [colorRows, sizeRows] = await Promise.all([
    db.select({ id: colors.id, name: colors.name }).from(colors).orderBy(asc(colors.name)),
    db.select({ id: sizes.id, name: sizes.name }).from(sizes).orderBy(asc(sizes.name)),
  ]);
  return { colors: colorRows, sizes: sizeRows };
}

export { ilike, or };
