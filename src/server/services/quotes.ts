/**
 * Serviço de orçamentos.
 * - Orçamento é um documento comercial com validade; não movimenta estoque nem
 *   financeiro até ser convertido em venda.
 * - A conversão acontece no PDV (ABRIR NO PDV) ou aqui, reutilizando createSale.
 * - Orçamentos vencidos são marcados como EXPIRED de forma preguiçosa (na leitura).
 */
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  customers,
  productVariants,
  products,
  quoteItems,
  quotes,
  sales,
  users,
} from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { d, money } from "../lib/money";
import { addDaysKey, inicioDoDia, todayKey } from "../lib/dates";
import { writeAudit } from "../lib/audit";
import { nextSequence, formatCode } from "../lib/sequences";
import { createSale, type Actor } from "./sales";

export type QuoteItemInput = { variantId: string; quantity: number; unitPrice?: number; discountAmount?: number };

export type QuoteInput = {
  customerId?: string | null;
  validUntil?: string | null;
  items: QuoteItemInput[];
  discountAmount?: number;
  notes?: string | null;
};

export async function createQuote(input: QuoteInput, actor: { id: string; name: string }) {
  if (!input.items.length) throw new BusinessRuleError("Adicione ao menos um produto ao orçamento.");
  const validUntil = input.validUntil || addDaysKey(todayKey(), 15);

  return db.transaction(async (tx) => {
    const seq = await nextSequence(tx, "quote");
    const code = await formatCode("ORC", seq);

    let subtotal = d(0);
    const prepared: Array<{
      variantId: string;
      productId: string;
      description: string;
      sku: string;
      quantity: number;
      unitPrice: string;
      discountAmount: string;
      total: string;
    }> = [];

    for (const item of input.items) {
      if (item.quantity <= 0) throw new BusinessRuleError("Quantidade inválida no orçamento.");
      const rows = await tx
        .select({
          variant: productVariants,
          productId: products.id,
          productName: products.name,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(productVariants.id, item.variantId))
        .limit(1);
      const row = rows[0];
      if (!row) throw new NotFoundError("Produto do orçamento");
      const unitPrice =
        item.unitPrice !== undefined
          ? money(item.unitPrice)
          : money(
              row.variant.promoPrice && d(row.variant.promoPrice).gt(0)
                ? row.variant.promoPrice
                : row.variant.salePrice,
            );
      const discount = money(item.discountAmount ?? 0);
      const lineTotal = d(unitPrice).times(item.quantity).minus(discount);
      if (lineTotal.lt(0)) throw new BusinessRuleError("Desconto maior que o valor do item.");
      subtotal = subtotal.plus(lineTotal);

      prepared.push({
        variantId: item.variantId,
        productId: row.productId,
        description: `${row.productName}${row.variant.colorName ? ` ${row.variant.colorName}` : ""}${row.variant.sizeName ? ` ${row.variant.sizeName}` : ""}`,
        sku: row.variant.sku,
        quantity: item.quantity,
        unitPrice,
        discountAmount: discount,
        total: money(lineTotal),
      });
    }

    const quoteDiscount = d(input.discountAmount ?? 0);
    const total = subtotal.minus(quoteDiscount);
    if (total.lt(0)) throw new BusinessRuleError("Desconto total maior que o valor do orçamento.");

    const [quote] = await tx
      .insert(quotes)
      .values({
        code,
        customerId: input.customerId ?? null,
        userId: actor.id,
        status: "OPEN",
        validUntil,
        subtotal: money(subtotal),
        discountAmount: money(quoteDiscount),
        total: money(total),
        notes: input.notes ?? null,
      })
      .returning();

    for (const item of prepared) {
      await tx.insert(quoteItems).values({
        quoteId: quote.id,
        variantId: item.variantId,
        productId: item.productId,
        description: item.description,
        sku: item.sku,
        quantity: money(item.quantity),
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        total: item.total,
      });
    }

    await writeAudit(
      {
        userId: actor.id,
        userName: actor.name,
        action: "QUOTE_CREATE",
        entity: "quote",
        entityId: quote.id,
        description: `Orçamento ${code} criado — R$ ${money(total)} (válido até ${validUntil})`,
      },
      tx,
    );

    return quote;
  });
}

export async function updateQuote(
  id: string,
  input: Partial<QuoteInput> & { status?: "OPEN" | "EXPIRED" | "CANCELED" },
  actor: { id: string; name: string },
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(quotes).where(eq(quotes.id, id)).limit(1);
    const quote = rows[0];
    if (!quote) throw new NotFoundError("Orçamento");
    if (quote.status === "CONVERTED") throw new BusinessRuleError("Orçamento já convertido em venda não pode ser alterado.");

    if (input.items) {
      if (!input.items.length) throw new BusinessRuleError("O orçamento precisa de ao menos um item.");
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      let subtotal = d(0);
      for (const item of input.items) {
        const row = (
          await tx
            .select({ variant: productVariants, productName: products.name })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(eq(productVariants.id, item.variantId))
            .limit(1)
        )[0];
        if (!row) throw new NotFoundError("Produto do orçamento");
        const unitPrice =
          item.unitPrice !== undefined
            ? money(item.unitPrice)
            : money(row.variant.promoPrice && d(row.variant.promoPrice).gt(0) ? row.variant.promoPrice : row.variant.salePrice);
        const discount = money(item.discountAmount ?? 0);
        const lineTotal = d(unitPrice).times(item.quantity).minus(d(discount));
        subtotal = subtotal.plus(lineTotal);
        await tx.insert(quoteItems).values({
          quoteId: id,
          variantId: item.variantId,
          productId: row.variant.productId,
          description: `${row.productName}${row.variant.colorName ? ` ${row.variant.colorName}` : ""}${row.variant.sizeName ? ` ${row.variant.sizeName}` : ""}`,
          sku: row.variant.sku,
          quantity: money(item.quantity),
          unitPrice,
          discountAmount: discount,
          total: money(lineTotal),
        });
      }
      const total = subtotal.minus(d(input.discountAmount ?? quote.discountAmount));
      await tx
        .update(quotes)
        .set({
          subtotal: money(subtotal),
          discountAmount: money(input.discountAmount ?? quote.discountAmount),
          total: money(total),
          updatedAt: new Date(),
        })
        .where(eq(quotes.id, id));
    }

    const [updated] = await tx
      .update(quotes)
      .set({
        customerId: input.customerId ?? quote.customerId,
        validUntil: input.validUntil ?? quote.validUntil,
        notes: input.notes ?? quote.notes,
        status: input.status ?? quote.status,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, id))
      .returning();

    await writeAudit(
      {
        userId: actor.id,
        userName: actor.name,
        action: "QUOTE_UPDATE",
        entity: "quote",
        entityId: id,
        description: `Orçamento ${quote.code} atualizado (${updated.status})`,
      },
      tx,
    );
    return updated;
  });
}

/** Marca como expirados os orçamentos abertos com validade vencida. */
export async function refreshExpiredQuotes() {
  await db.execute(sql`
    UPDATE quotes SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'OPEN' AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
  `);
}

export async function listQuotes(params: {
  status?: string;
  customerId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  const conds = [];
  if (params.status && params.status !== "ALL") conds.push(eq(quotes.status, params.status as never));
  if (params.customerId) conds.push(eq(quotes.customerId, params.customerId));
  if (params.from) conds.push(sql`${quotes.createdAt} >= ${inicioDoDia(params.from).toISOString()}::timestamptz`);
  if (params.to) conds.push(sql`${quotes.createdAt} <= ${inicioDoDia(addDaysKey(params.to, 1)).toISOString()}::timestamptz`);
  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    conds.push(sql`(lower(${quotes.code}) LIKE ${term} OR lower(${customers.name}) LIKE ${term})`);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        quote: quotes,
        customerName: customers.name,
        userName: users.name,
        itemCount: sql<number>`(SELECT COUNT(*)::int FROM quote_items WHERE quote_id = ${quotes.id})`,
      })
      .from(quotes)
      .leftJoin(customers, eq(customers.id, quotes.customerId))
      .leftJoin(users, eq(users.id, quotes.userId))
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${quotes.total}), 0)::text`,
        open: sql<string>`COALESCE(SUM(CASE WHEN ${quotes.status} = 'OPEN' THEN ${quotes.total} ELSE 0 END), 0)::text`,
        converted: sql<string>`COALESCE(SUM(CASE WHEN ${quotes.status} = 'CONVERTED' THEN ${quotes.total} ELSE 0 END), 0)::text`,
      })
      .from(quotes)
      .leftJoin(customers, eq(customers.id, quotes.customerId))
      .where(where),
  ]);

  return {
    items: items.map((row) => ({
      ...row.quote,
      createdAt: row.quote.createdAt.toISOString(),
      updatedAt: row.quote.updatedAt.toISOString(),
      customerName: row.customerName,
      userName: row.userName,
      itemCount: Number(row.itemCount ?? 0),
    })),
    total: Number(totals[0]?.count ?? 0),
    totals: {
      total: totals[0]?.total ?? "0.00",
      open: totals[0]?.open ?? "0.00",
      converted: totals[0]?.converted ?? "0.00",
    },
    page,
    pageSize,
  };
}

export async function getQuote(id: string) {
  const rows = await db
    .select({
      quote: quotes,
      customerName: customers.name,
      customerPhone: customers.phone,
      userName: users.name,
      convertedSaleNumber: sales.number,
    })
    .from(quotes)
    .leftJoin(customers, eq(customers.id, quotes.customerId))
    .leftJoin(users, eq(users.id, quotes.userId))
    .leftJoin(sales, eq(sales.id, quotes.convertedSaleId))
    .where(eq(quotes.id, id))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Orçamento");

  const items = await db
    .select({
      id: quoteItems.id,
      variantId: quoteItems.variantId,
      description: quoteItems.description,
      sku: quoteItems.sku,
      quantity: quoteItems.quantity,
      unitPrice: quoteItems.unitPrice,
      discountAmount: quoteItems.discountAmount,
      total: quoteItems.total,
      colorName: productVariants.colorName,
      sizeName: productVariants.sizeName,
      stockQty: productVariants.stockQty,
    })
    .from(quoteItems)
    .leftJoin(productVariants, eq(productVariants.id, quoteItems.variantId))
    .where(eq(quoteItems.quoteId, id))
    .orderBy(asc(quoteItems.description));

  return {
    quote: {
      ...rows[0].quote,
      createdAt: rows[0].quote.createdAt.toISOString(),
      updatedAt: rows[0].quote.updatedAt.toISOString(),
      customerName: rows[0].customerName,
      customerPhone: rows[0].customerPhone,
      userName: rows[0].userName,
      convertedSaleNumber: rows[0].convertedSaleNumber,
    },
    items: items.map((i) => ({ ...i, stockQty: i.stockQty ? String(i.stockQty) : null })),
  };
}

/** Converte o orçamento em venda finalizada (usado quando o cliente aprova). */
export async function convertQuoteToSale(params: {
  quoteId: string;
  payments: Array<{
    method: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "TRANSFER" | "OTHER";
    amount: number | string;
    installments?: number;
    tenderedAmount?: number | string;
    firstDueDate?: string;
  }>;
  discountPercent?: number;
  discountAmount?: number;
  surchargeAmount?: number;
  discountReason?: string;
  actor: Actor;
}) {
  const detail = await getQuote(params.quoteId);
  if (detail.quote.status === "CONVERTED") throw new BusinessRuleError("Este orçamento já foi convertido em venda.");
  if (detail.quote.status === "CANCELED") throw new BusinessRuleError("Orçamento cancelado não pode ser convertido.");
  if (!detail.items.length) throw new BusinessRuleError("Orçamento sem itens.");

  const result = await createSale(
    {
      customerId: detail.quote.customerId,
      sellerId: params.actor.id,
      items: detail.items
        .filter((i) => i.variantId)
        .map((i) => ({
          variantId: i.variantId as string,
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
        })),
      payments: params.payments.map((p) => ({ ...p, amount: String(p.amount) })),
      discountPercent: params.discountPercent,
      discountAmount: params.discountAmount ?? Number(detail.quote.discountAmount),
      surchargeAmount: params.surchargeAmount,
      discountReason: params.discountReason ?? `Conversão do orçamento ${detail.quote.code}`,
      notes: detail.quote.notes ?? undefined,
      quoteId: detail.quote.id,
    },
    params.actor,
  );

  await writeAudit({
    userId: params.actor.id,
    userName: params.actor.name,
    action: "QUOTE_CONVERT",
    entity: "quote",
    entityId: detail.quote.id,
    description: `Orçamento ${detail.quote.code} convertido na venda #${result.sale.number}`,
  });

  return result;
}

export async function cancelQuote(id: string, reason: string, actor: { id: string; name: string }) {
  if (!reason?.trim()) throw new BusinessRuleError("Informe o motivo do cancelamento.");
  const rows = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Orçamento");
  if (rows[0].status === "CONVERTED") throw new BusinessRuleError("Orçamento convertido não pode ser cancelado.");
  const [updated] = await db
    .update(quotes)
    .set({ status: "CANCELED", notes: `${rows[0].notes ?? ""}\nCancelado: ${reason}`.trim(), updatedAt: new Date() })
    .where(eq(quotes.id, id))
    .returning();
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "QUOTE_CANCEL",
    entity: "quote",
    entityId: id,
    description: `Orçamento ${rows[0].code} cancelado — ${reason}`,
  });
  return updated;
}

export async function quoteStats(from: string, to: string) {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'CONVERTED')::int AS converted,
           COALESCE(SUM(total) FILTER (WHERE status = 'CONVERTED'), 0)::text AS converted_value,
           COALESCE(SUM(total) FILTER (WHERE status = 'OPEN'), 0)::text AS open_value
      FROM quotes
     WHERE created_at >= ${inicioDoDia(from).toISOString()}::timestamptz AND created_at <= ${inicioDoDia(addDaysKey(to, 1)).toISOString()}::timestamptz
  `);
  const r = (rows.rows as Array<Record<string, string | number>>)[0] ?? {};
  const total = Number(r.total ?? 0);
  const converted = Number(r.converted ?? 0);
  return {
    total,
    converted,
    conversionRate: total > 0 ? Number(((converted / total) * 100).toFixed(1)) : 0,
    convertedValue: money(String(r.converted_value ?? 0)),
    openValue: money(String(r.open_value ?? 0)),
  };
}

export { inArray, lt };
