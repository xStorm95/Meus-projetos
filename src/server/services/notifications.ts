/**
 * Motor de notificações e alertas.
 * As verificações são idempotentes (chave de deduplicação) e podem ser
 * disparadas ao abrir o sistema/central de notificações.
 */
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  cashSessions,
  customers,
  notifications,
  payables,
  productVariants,
  products,
  receivables,
} from "../db/schema";
import { money } from "../lib/money";
import { addDaysKey, todayKey } from "../lib/dates";

type NewNotification = {
  type: string;
  severity: "INFO" | "WARNING" | "DANGER" | "SUCCESS";
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  dedupeKey?: string;
};

export async function createNotification(n: NewNotification) {
  await db
    .insert(notifications)
    .values({
      type: n.type,
      severity: n.severity,
      title: n.title,
      message: n.message,
      entity: n.entity ?? null,
      entityId: n.entityId ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

export async function listNotifications(params: { unreadOnly?: boolean; limit?: number } = {}) {
  const conditions = [];
  if (params.unreadOnly) conditions.push(eq(notifications.isRead, false));
  return db
    .select()
    .from(notifications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${notifications.createdAt} DESC`)
    .limit(params.limit ?? 50);
}

export async function markNotificationRead(id: string) {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markAllRead() {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.isRead, false));
}

export async function unreadCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.isRead, false));
  return Number(rows[0]?.count ?? 0);
}

/**
 * Recalcula alertas a partir do estado atual do banco.
 * Chamado antes de exibir a central de notificações.
 */
export async function refreshAlerts(): Promise<void> {
  const today = todayKey();

  // Estoque baixo / sem estoque
  const lowStock = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      name: products.name,
      colorName: productVariants.colorName,
      sizeName: productVariants.sizeName,
      stockQty: productVariants.stockQty,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(products.status, "ACTIVE"),
        isNull(products.deletedAt),
        eq(productVariants.isActive, true),
        sql`${productVariants.stockQty}::numeric <= COALESCE(${productVariants.lowStock}, ${products.lowStock})::numeric`,
      ),
    )
    .limit(200);

  for (const v of lowStock) {
    const out = Number(v.stockQty) <= 0;
    await createNotification({
      type: out ? "STOCK_OUT" : "STOCK_LOW",
      severity: out ? "DANGER" : "WARNING",
      title: out ? "Produto sem estoque" : "Estoque baixo",
      message: `${v.name}${v.colorName ? ` / ${v.colorName}` : ""}${
        v.sizeName ? ` / ${v.sizeName}` : ""
      } (${v.sku}) — ${Number(v.stockQty)} un. em estoque`,
      entity: "product_variant",
      entityId: v.variantId,
      dedupeKey: `stock:${v.variantId}:${out ? "out" : "low"}:${today}`,
    });
  }

  // Contas a pagar vencidas e a vencer em 7 dias
  const soon = addDaysKey(today, 7);
  const duePayables = await db
    .select()
    .from(payables)
    .where(
      and(
        lte(payables.dueDate, soon),
        or(eq(payables.status, "PENDING"), eq(payables.status, "PARTIAL")),
      ),
    )
    .limit(200);

  for (const p of duePayables) {
    const overdue = p.dueDate < today;
    await createNotification({
      type: overdue ? "PAYABLE_OVERDUE" : "PAYABLE_DUE_SOON",
      severity: overdue ? "DANGER" : "WARNING",
      title: overdue ? "Conta a pagar atrasada" : "Conta a pagar vencendo",
      message: `${p.description} — R$ ${money(Number(p.amount) - Number(p.paidAmount))} com vencimento em ${p.dueDate}`,
      entity: "payable",
      entityId: p.id,
      dedupeKey: `payable:${p.id}:${overdue ? "overdue" : "soon"}:${today}`,
    });
  }

  // Crediário atrasado
  const overdueReceivables = await db
    .select({
      id: receivables.id,
      amount: receivables.amount,
      paidAmount: receivables.paidAmount,
      dueDate: receivables.dueDate,
      customerName: customers.name,
      customerId: receivables.customerId,
    })
    .from(receivables)
    .leftJoin(customers, eq(customers.id, receivables.customerId))
    .where(
      and(
        lt(receivables.dueDate, today),
        or(eq(receivables.status, "PENDING"), eq(receivables.status, "PARTIAL")),
      ),
    )
    .limit(200);

  for (const r of overdueReceivables) {
    await createNotification({
      type: "RECEIVABLE_OVERDUE",
      severity: "DANGER",
      title: "Parcela de crediário atrasada",
      message: `${r.customerName ?? "Cliente"} — R$ ${money(
        Number(r.amount) - Number(r.paidAmount),
      )} vencida em ${r.dueDate}`,
      entity: "receivable",
      entityId: r.id,
      dedupeKey: `receivable:${r.id}:overdue`,
    });
  }

  // Aniversariantes do mês
  const month = today.slice(5, 7);
  const birthdays = await db
    .select({ id: customers.id, name: customers.name, birthDate: customers.birthDate })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        eq(customers.isActive, true),
        sql`to_char(${customers.birthDate}, 'MM') = ${month}`,
      ),
    )
    .limit(100);

  for (const c of birthdays) {
    await createNotification({
      type: "BIRTHDAY",
      severity: "INFO",
      title: "Aniversariante do mês",
      message: `${c.name} faz aniversário em ${c.birthDate?.slice(8, 10)}/${month}. Boa oportunidade de contato!`,
      entity: "customer",
      entityId: c.id,
      dedupeKey: `birthday:${c.id}:${today.slice(0, 7)}`,
    });
  }

  // Caixas abertos há mais de 24h
  const openSessions = await db
    .select()
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.status, "OPEN"),
        lt(cashSessions.openedAt, new Date(Date.now() - 86_400_000)),
      ),
    )
    .limit(20);

  for (const s of openSessions) {
    await createNotification({
      type: "CASH_OPEN_LONG",
      severity: "WARNING",
      title: "Caixa aberto há mais de 24 horas",
      message: `O caixa ${s.code} continua aberto desde ${s.openedAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}.`,
      entity: "cash_session",
      entityId: s.id,
      dedupeKey: `cash-open:${s.id}:${today}`,
    });
  }
}
