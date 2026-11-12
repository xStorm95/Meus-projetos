/**
 * Serviço de trocas e devoluções.
 * - Reintegra (ou não) o estoque conforme a condição do produto.
 * - Gera crédito ao cliente, estorno financeiro ou nova venda de troca.
 * - Atualiza a quantidade devolvida por item respeitando o limite comprado.
 * - Nunca apaga registros: toda operação fica no histórico.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  cashMovements,
  cashSessions,
  customerCredits,
  customers,
  receivables,
  returnItems,
  returns,
  saleItems,
  sales,
} from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { d, money } from "../lib/money";
import { nextSequence, formatCode } from "../lib/sequences";
import { getDefaultWarehouse, moveStock } from "./stock";
import { writeAudit } from "../lib/audit";
import { addDaysKey, inicioDoDia } from "../lib/dates";

export type CreateReturnInput = {
  saleId: string;
  type: "EXCHANGE" | "RETURN";
  reason: string;
  items: Array<{
    saleItemId: string;
    quantity: number;
    action: "RESTOCK" | "DAMAGED" | "DISCARD";
  }>;
  refundMethod: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "EXCHANGE" | "NONE";
  notes?: string;
  /** Para trocas: variantes que o cliente leva no lugar */
  exchangeItems?: Array<{ variantId: string; quantity: number }>;
};

export async function createReturn(input: CreateReturnInput, actor: { id: string; name: string }) {
  if (!input.reason?.trim()) {
    throw new BusinessRuleError("Informe o motivo da troca/devolução.");
  }
  if (!input.items.length) {
    throw new BusinessRuleError("Selecione ao menos um item da venda original.");
  }

  return db.transaction(async (tx) => {
    const saleRows = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
    const sale = saleRows[0];
    if (!sale) throw new NotFoundError("Venda");
    if (sale.status !== "COMPLETED") {
      throw new BusinessRuleError(
        "Somente vendas finalizadas podem ter itens trocados ou devolvidos.",
      );
    }

    const seq = await nextSequence(tx, input.type === "EXCHANGE" ? "exchange" : "return");
    const code = await formatCode(input.type === "EXCHANGE" ? "TC" : "DV", seq);
    const warehouse = await getDefaultWarehouse(tx);

    let returnedTotal = d(0);
    const preparedItems: Array<{
      saleItemId: string;
      variantId: string | null;
      description: string;
      quantity: number;
      unitPrice: string;
      total: string;
      action: "RESTOCK" | "DAMAGED" | "DISCARD";
    }> = [];

    for (const reqItem of input.items) {
      const itemRows = await tx
        .select()
        .from(saleItems)
        .where(and(eq(saleItems.id, reqItem.saleItemId), eq(saleItems.saleId, sale.id)))
        .limit(1);
      const item = itemRows[0];
      if (!item) throw new NotFoundError("Item da venda");

      const alreadyReturned = Number(item.returnedQty);
      const purchased = Number(item.quantity);
      const qty = Number(reqItem.quantity);
      if (qty <= 0) throw new BusinessRuleError("Quantidade devolvida inválida.");
      if (alreadyReturned + qty > purchased) {
        throw new BusinessRuleError(
          `Item "${item.description}": quantidade devolvida (${alreadyReturned + qty}) excede a comprada (${purchased}).`,
        );
      }

      // Preço unitário líquido (considerando desconto do item)
      const netUnit = d(item.total).dividedBy(d(item.quantity));
      const lineTotal = netUnit.times(qty);
      returnedTotal = returnedTotal.plus(lineTotal);

      preparedItems.push({
        saleItemId: item.id,
        variantId: item.variantId,
        description: item.description,
        quantity: qty,
        unitPrice: money(netUnit),
        total: money(lineTotal),
        action: reqItem.action,
      });
    }

    if (input.type === "EXCHANGE" && (!input.exchangeItems || !input.exchangeItems.length)) {
      throw new BusinessRuleError("Informe os produtos que serão entregues na troca.");
    }

    // Valida e calcula os itens novos da troca
    let newItemsTotal = d(0);
    const newItems: Array<{ variantId: string; quantity: number; unitPrice: string }> = [];
    if (input.type === "EXCHANGE" && input.exchangeItems) {
      const { getVariantWithProduct } = await import("./stock");
      for (const ni of input.exchangeItems) {
        const { variant, product } = await getVariantWithProduct(tx, ni.variantId);
        if (product.status !== "ACTIVE") throw new BusinessRuleError(`"${product.name}" está inativo.`);
        const available = Number(variant.stockQty) - Number(variant.reservedQty);
        if (available < ni.quantity) {
          throw new BusinessRuleError(
            `Estoque insuficiente de "${product.name}${variant.sizeName ? ` / ${variant.sizeName}` : ""}" para a troca (disponível: ${available}).`,
          );
        }
        const unitPrice = money(variant.promoPrice && Number(variant.promoPrice) > 0 ? variant.promoPrice : variant.salePrice);
        newItemsTotal = newItemsTotal.plus(d(unitPrice).times(ni.quantity));
        newItems.push({ variantId: ni.variantId, quantity: ni.quantity, unitPrice });
      }
    }

    const [created] = await tx
      .insert(returns)
      .values({
        code,
        type: input.type,
        saleId: sale.id,
        customerId: sale.customerId,
        userId: actor.id,
        reason: input.reason,
        refundMethod: input.refundMethod,
        returnedTotal: money(returnedTotal),
        newItemsTotal: money(newItemsTotal),
        difference: money(newItemsTotal.minus(returnedTotal)),
        notes: input.notes ?? null,
      })
      .returning();

    // Registra itens devolvidos + movimenta estoque
    for (const item of preparedItems) {
      await tx.insert(returnItems).values({
        returnId: created.id,
        saleItemId: item.saleItemId,
        variantId: item.variantId,
        description: item.description,
        quantity: money(item.quantity),
        unitPrice: item.unitPrice,
        total: item.total,
        action: item.action,
      });

      await tx.execute(sql`
        UPDATE sale_items SET returned_qty = returned_qty + ${item.quantity}::numeric
        WHERE id = ${item.saleItemId}
      `);

      if (item.variantId && item.action === "RESTOCK") {
        await moveStock(tx, {
          variantId: item.variantId,
          warehouseId: warehouse.id,
          delta: item.quantity,
          type: input.type === "EXCHANGE" ? "EXCHANGE_IN" : "RETURN",
          referenceType: input.type === "EXCHANGE" ? "EXCHANGE" : "RETURN",
          referenceId: created.id,
          reason: `${input.type === "EXCHANGE" ? "Troca" : "Devolução"} ${code}: ${input.reason}`,
          userId: actor.id,
          userName: actor.name,
          allowNegative: true,
        });
      } else if (item.variantId && item.action !== "RESTOCK") {
        // Produto avariado/descartado: registra baixa com motivo
        await moveStock(tx, {
          variantId: item.variantId,
          warehouseId: warehouse.id,
          delta: 0,
          type: item.action === "DAMAGED" ? "DAMAGE" : "LOSS",
          referenceType: input.type,
          referenceId: created.id,
          reason: `${code}: produto ${item.action === "DAMAGED" ? "avariado" : "descartado"} — ${input.reason}`,
          userId: actor.id,
          userName: actor.name,
          allowNegative: true,
        }).catch(() => undefined); // delta zero não gera movimentação; ignora
      }
    }

    // Baixa dos itens novos da troca
    for (const ni of newItems) {
      await moveStock(tx, {
        variantId: ni.variantId,
        warehouseId: warehouse.id,
        delta: -ni.quantity,
        type: "EXCHANGE_OUT",
        referenceType: "EXCHANGE",
        referenceId: created.id,
        reason: `Troca ${code}`,
        userId: actor.id,
        userName: actor.name,
        allowNegative: true,
      });
    }

    const difference = newItemsTotal.minus(returnedTotal);

    // Financeiro
    if (difference.lt(0)) {
      // Cliente tem crédito a receber
      const creditAmount = difference.abs();
      if (input.refundMethod === "STORE_CREDIT" && sale.customerId) {
        await tx.insert(customerCredits).values({
          customerId: sale.customerId,
          amount: money(creditAmount),
          origin: "RETURN",
          referenceId: created.id,
          notes: `Crédito gerado por ${input.type === "EXCHANGE" ? "troca" : "devolução"} ${code}`,
          createdBy: actor.id,
        });
        await tx.update(returns).set({ creditGenerated: money(creditAmount) }).where(eq(returns.id, created.id));
      } else if (input.refundMethod !== "NONE" && input.refundMethod !== "EXCHANGE") {
        const session = await tx
          .select()
          .from(cashSessions)
          .where(and(eq(cashSessions.status, "OPEN"), eq(cashSessions.userId, actor.id)))
          .limit(1);
        if (session[0]) {
          await tx.insert(cashMovements).values({
            sessionId: session[0].id,
            type: "REFUND",
            method: input.refundMethod === "STORE_CREDIT" ? null : (input.refundMethod as never),
            amount: money(-creditAmount),
            description: `Estorno ${code} (${input.type === "EXCHANGE" ? "troca" : "devolução"})`,
            referenceType: "RETURN",
            referenceId: created.id,
            userId: actor.id,
            userName: actor.name,
          });
        }
      }
    } else if (difference.gt(0)) {
      // Cliente paga a diferença
      const session = await tx
        .select()
        .from(cashSessions)
        .where(and(eq(cashSessions.status, "OPEN"), eq(cashSessions.userId, actor.id)))
        .limit(1);
      if (session[0]) {
        await tx.insert(cashMovements).values({
          sessionId: session[0].id,
          type: "RECEIPT",
          method: "CASH",
          amount: money(difference),
          description: `Diferença paga na troca ${code}`,
          referenceType: "RETURN",
          referenceId: created.id,
          userId: actor.id,
          userName: actor.name,
        });
      }
    }

    // Devolução total de venda a prazo: cancela parcelas pendentes proporcionalmente
    if (input.type === "RETURN") {
      const totalReturned = d(sale.total).minus(returnedTotal);
      if (totalReturned.lte(0)) {
        await tx.execute(sql`
          UPDATE receivables SET status = 'CANCELED', updated_at = now(),
            notes = COALESCE(notes,'') || ' | Cancelada por devolução total'
          WHERE sale_id = ${sale.id} AND status IN ('PENDING','PARTIAL','OVERDUE')
        `);
      }
    }

    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      action: input.type === "EXCHANGE" ? "EXCHANGE_CREATE" : "RETURN_CREATE",
      entity: "return",
      entityId: created.id,
      description: `${input.type === "EXCHANGE" ? "Troca" : "Devolução"} ${code} da venda #${sale.number} — R$ ${money(returnedTotal)}. Motivo: ${input.reason}`,
      after: { code, returnedTotal: money(returnedTotal), newItemsTotal: money(newItemsTotal) },
    }, tx);

    return { returnRecord: created, difference: money(difference), newItems };
  });
}

/** Saldo de crédito disponível do cliente. */
export async function availableCredit(customerId: string): Promise<string> {
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${customerCredits.amount} - ${customerCredits.usedAmount}), 0)::text`,
    })
    .from(customerCredits)
    .where(and(eq(customerCredits.customerId, customerId), eq(customerCredits.isActive, true)));
  return money(rows[0]?.total ?? 0);
}

/** Saldo devedor do cliente no crediário. */
export async function customerDebt(customerId: string): Promise<{
  total: string;
  overdue: string;
  open: string;
}> {
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${receivables.amount} - ${receivables.paidAmount}), 0)::text`,
      overdue: sql<string>`COALESCE(SUM(CASE WHEN ${receivables.dueDate} < CURRENT_DATE THEN ${receivables.amount} - ${receivables.paidAmount} ELSE 0 END), 0)::text`,
      open: sql<string>`COALESCE(SUM(CASE WHEN ${receivables.dueDate} >= CURRENT_DATE THEN ${receivables.amount} - ${receivables.paidAmount} ELSE 0 END), 0)::text`,
    })
    .from(receivables)
    .where(
      and(
        eq(receivables.customerId, customerId),
        sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`,
      ),
    );
  return {
    total: money(rows[0]?.total ?? 0),
    overdue: money(rows[0]?.overdue ?? 0),
    open: money(rows[0]?.open ?? 0),
  };
}

export async function customerSummary(customerId: string) {
  const rows = await db
    .select({
      purchaseCount: sql<number>`COUNT(*)::int`,
      totalSpent: sql<string>`COALESCE(SUM(${sales.total}), 0)::text`,
      lastPurchase: sql<string | null>`MAX(${sales.completedAt})::text`,
      firstPurchase: sql<string | null>`MIN(${sales.completedAt})::text`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.customerId, customerId),
        eq(sales.status, "COMPLETED"),
      ),
    );
  const r = rows[0];
  const count = Number(r?.purchaseCount ?? 0);
  const total = money(r?.totalSpent ?? 0);
  const debt = await customerDebt(customerId);
  const credit = await availableCredit(customerId);
  const customerRows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const customer = customerRows[0];

  const status = classifyCustomer({
    purchaseCount: count,
    totalSpent: total,
    lastPurchase: r?.lastPurchase ?? null,
    hasOpenDebt: Number(debt.total) > 0,
    hasOverdue: Number(debt.overdue) > 0,
    birthDate: customer?.birthDate ?? null,
  });

  return {
    purchaseCount: count,
    totalSpent: total,
    ticketAverage: count > 0 ? money(d(total).dividedBy(count)) : "0.00",
    lastPurchase: r?.lastPurchase ?? null,
    firstPurchase: r?.firstPurchase ?? null,
    debtTotal: debt.total,
    debtOverdue: debt.overdue,
    debtOpen: debt.open,
    creditAvailable: credit,
    classifications: status,
    creditLimit: customer?.creditLimit ?? "0.00",
  };
}

export function classifyCustomer(params: {
  purchaseCount: number;
  totalSpent: string;
  lastPurchase: string | null;
  hasOpenDebt: boolean;
  hasOverdue: boolean;
  birthDate: string | null;
  now?: Date;
}): string[] {
  const result: string[] = [];
  const now = params.now ?? new Date();
  const daysSince = params.lastPurchase
    ? Math.floor((now.getTime() - new Date(params.lastPurchase).getTime()) / 86_400_000)
    : null;

  if (params.purchaseCount === 0) result.push("NOVO");
  else if (params.purchaseCount === 1) result.push("NOVO");
  if (params.purchaseCount >= 2) result.push("RECORRENTE");
  if (Number(params.totalSpent) >= 1500 || params.purchaseCount >= 8) result.push("VIP");
  if (daysSince !== null && daysSince > 90) result.push("INATIVO");
  if (params.hasOverdue) result.push("INADIMPLENTE");
  if (params.birthDate) {
    const month = Number(params.birthDate.slice(5, 7));
    if (month === now.getUTCMonth() + 1) result.push("ANIVERSARIANTE");
  }
  return result;
}

export const CUSTOMER_TAG_LABELS: Record<string, string> = {
  NOVO: "Cliente novo",
  RECORRENTE: "Cliente recorrente",
  VIP: "Cliente VIP",
  INATIVO: "Cliente inativo",
  INADIMPLENTE: "Crediário em aberto",
  ANIVERSARIANTE: "Aniversariante do mês",
};

/* ============================ CONSULTAS ============================ */

function mapReturnRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    code: String(row.code),
    type: String(row.type),
    saleId: row.sale_id ? String(row.sale_id) : null,
    saleNumber: row.sale_number ? Number(row.sale_number) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    reason: String(row.reason),
    refundMethod: String(row.refund_method),
    returnedTotal: money(String(row.returned_total ?? 0)),
    newItemsTotal: money(String(row.new_items_total ?? 0)),
    difference: money(String(row.difference ?? 0)),
    creditGenerated: money(String(row.credit_generated ?? 0)),
    notes: row.notes ? String(row.notes) : null,
    userName: row.user_name ? String(row.user_name) : null,
    createdAt: String(row.created_at),
    itemsCount: Number(row.items_count ?? 0),
  };
}

export async function listReturns(params: {
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  const conds = [sql`1 = 1`];
  if (params.type && params.type !== "ALL") conds.push(sql`r.type = ${params.type}`);
  if (params.from) conds.push(sql`r.created_at >= ${inicioDoDia(params.from).toISOString()}::timestamptz`);
  if (params.to) conds.push(sql`r.created_at <= ${inicioDoDia(addDaysKey(params.to, 1)).toISOString()}::timestamptz`);
  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    conds.push(sql`(lower(r.code) LIKE ${term} OR lower(c.name) LIKE ${term} OR CAST(s.number AS TEXT) LIKE ${term})`);
  }
  const where = sql.join(conds, sql` AND `);

  const [rows, totals] = await Promise.all([
    db.execute(sql`
      SELECT r.*, c.name AS customer_name, s.number AS sale_number, u.name AS user_name,
             (SELECT COUNT(*)::int FROM return_items ri WHERE ri.return_id = r.id) AS items_count
        FROM returns r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN sales s ON s.id = r.sale_id
        LEFT JOIN users u ON u.id = r.user_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(r.returned_total), 0)::text AS returned,
             COALESCE(SUM(r.credit_generated), 0)::text AS credits,
             COUNT(*) FILTER (WHERE r.type = 'EXCHANGE')::int AS exchanges,
             COUNT(*) FILTER (WHERE r.type = 'RETURN')::int AS returns_count
        FROM returns r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN sales s ON s.id = r.sale_id
       WHERE ${where}
    `),
  ]);

  const t = (totals.rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    items: (rows.rows as Array<Record<string, unknown>>).map(mapReturnRow),
    total: Number(t.count ?? 0),
    totals: {
      returned: money(String(t.returned ?? 0)),
      credits: money(String(t.credits ?? 0)),
      exchanges: Number(t.exchanges ?? 0),
      returns: Number(t.returns_count ?? 0),
    },
    page,
    pageSize,
  };
}

export async function getReturnDetail(id: string) {
  const rows = await db.execute(sql`
    SELECT r.*, c.name AS customer_name, s.number AS sale_number, u.name AS user_name,
           (SELECT COUNT(*)::int FROM return_items ri WHERE ri.return_id = r.id) AS items_count
      FROM returns r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN users u ON u.id = r.user_id
     WHERE r.id = ${id}
     LIMIT 1
  `);
  const row = (rows.rows as Array<Record<string, unknown>>)[0];
  if (!row) throw new NotFoundError("Troca/devolução");
  const items = await db.execute(sql`
    SELECT ri.id, ri.description, ri.quantity::text, ri.unit_price::text, ri.total::text,
           ri.action, pv.sku, pv.color_name, pv.size_name
      FROM return_items ri
      LEFT JOIN product_variants pv ON pv.id = ri.variant_id
     WHERE ri.return_id = ${id}
     ORDER BY ri.description
  `);
  return {
    returnRecord: mapReturnRow(row),
    items: (items.rows as Array<Record<string, unknown>>).map((i) => ({
      id: String(i.id),
      description: String(i.description),
      quantity: String(i.quantity),
      unitPrice: money(String(i.unit_price)),
      total: money(String(i.total)),
      action: String(i.action),
      sku: i.sku ? String(i.sku) : null,
      colorName: i.color_name ? String(i.color_name) : null,
      sizeName: i.size_name ? String(i.size_name) : null,
    })),
  };
}

/** Venda com itens elegíveis para troca/devolução (usada no formulário). */
export async function saleForReturn(saleIdOrNumber: string) {
  const numeric = Number(saleIdOrNumber.replace(/\D/g, ""));
  const rows = await db.execute(sql`
    SELECT s.id, s.number, s.total::text, s.status, s.created_at, s.customer_id,
           c.name AS customer_name, c.phone AS customer_phone,
           s.completed_at
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id::text = ${saleIdOrNumber}
        OR (${Number.isFinite(numeric) && numeric > 0} AND s.number = ${numeric})
     LIMIT 1
  `);
  const sale = (rows.rows as Array<Record<string, unknown>>)[0];
  if (!sale) throw new NotFoundError("Venda");
  if (String(sale.status) !== "COMPLETED") {
    throw new BusinessRuleError("Somente vendas concluídas podem gerar troca ou devolução.");
  }

  const items = await db.execute(sql`
    SELECT si.id, si.description, si.sku, si.color_name, si.size_name,
           si.quantity::text, si.returned_qty::text, si.unit_price::text, si.total::text,
           (si.quantity - si.returned_qty)::text AS available_qty,
           si.variant_id
      FROM sale_items si
     WHERE si.sale_id = ${String(sale.id)}
     ORDER BY si.description
  `);

  const creditRows = await db.execute(sql`
    SELECT COALESCE(SUM(amount - used_amount), 0)::text AS credit FROM customer_credits
     WHERE customer_id = ${sale.customer_id as string} AND is_active = true
  `);

  return {
    sale: {
      id: String(sale.id),
      number: Number(sale.number),
      total: money(String(sale.total)),
      createdAt: String(sale.created_at),
      customerId: sale.customer_id ? String(sale.customer_id) : null,
      customerName: sale.customer_name ? String(sale.customer_name) : null,
      customerPhone: sale.customer_phone ? String(sale.customer_phone) : null,
    },
    items: (items.rows as Array<Record<string, unknown>>).map((i) => ({
      id: String(i.id),
      variantId: i.variant_id ? String(i.variant_id) : null,
      description: String(i.description),
      sku: i.sku ? String(i.sku) : null,
      colorName: i.color_name ? String(i.color_name) : null,
      sizeName: i.size_name ? String(i.size_name) : null,
      quantity: String(i.quantity),
      returnedQty: String(i.returned_qty),
      availableQty: String(i.available_qty),
      unitPrice: money(String(i.unit_price)),
      total: money(String(i.total)),
    })),
    creditAvailable: money(String((creditRows.rows as Array<{ credit: string }>)[0]?.credit ?? 0)),
  };
}
