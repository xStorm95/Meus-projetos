/**
 * Serviço de caixa — abertura, movimentações e fechamento com conferência.
 *
 * Regras:
 *  - Um usuário só pode ter UM caixa aberto por vez (garantido por índice único parcial).
 *  - Caixa fechado é imutável: nenhuma movimentação pode ser adicionada.
 *  - O valor esperado é calculado a partir dos movimentos do caixa:
 *    abertura + entradas (vendas/recebimentos/suprimentos) - saídas (sangrias/pagamentos/estornos).
 *  - O dinheiro físico em espécie é separado das demais formas (Pix, cartão etc.)
 *    para a conferência da gaveta.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { cashMovements, cashSessions } from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { d, money, sum } from "../lib/money";
import { nextSequence, formatCode } from "../lib/sequences";
import { writeAudit } from "../lib/audit";

export const METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  DEBIT: "Cartão de Débito",
  CREDIT: "Cartão de Crédito",
  STORE_CREDIT: "Crediário",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

export async function getOpenSession(userId?: string) {
  const conditions = [eq(cashSessions.status, "OPEN")];
  if (userId) conditions.push(eq(cashSessions.userId, userId));
  const rows = await db
    .select()
    .from(cashSessions)
    .where(and(...conditions))
    .orderBy(sql`${cashSessions.openedAt} DESC`)
    .limit(1);
  return rows[0] ?? null;
}

export async function openSession(params: {
  userId: string;
  userName: string;
  openingAmount: string | number;
  notes?: string;
}) {
  const existing = await getOpenSession(params.userId);
  if (existing) {
    throw new BusinessRuleError(
      `Você já possui um caixa aberto (${existing.code}), aberto em ${existing.openedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Feche-o antes de abrir outro.`,
    );
  }
  if (d(params.openingAmount).lt(0)) {
    throw new BusinessRuleError("O valor inicial do caixa não pode ser negativo.");
  }

  return db.transaction(async (tx) => {
    const seq = await nextSequence(tx, "cash");
    const code = await formatCode("CX", seq);
    const [session] = await tx
      .insert(cashSessions)
      .values({
        code,
        userId: params.userId,
        openingAmount: money(params.openingAmount),
        openingNotes: params.notes ?? null,
      })
      .returning();

    await tx.insert(cashMovements).values({
      sessionId: session.id,
      type: "OPENING",
      method: "CASH",
      amount: money(params.openingAmount),
      description: "Abertura de caixa",
      referenceType: "MANUAL",
      userId: params.userId,
      userName: params.userName,
    });

    await writeAudit({
      userId: params.userId,
      userName: params.userName,
      action: "CASH_OPEN",
      entity: "cash_session",
      entityId: session.id,
      description: `Caixa ${code} aberto com R$ ${money(params.openingAmount)}`,
    }, tx);

    return session;
  });
}

export async function addCashMovement(params: {
  sessionId: string;
  type: "WITHDRAWAL" | "SUPPLY" | "RECEIPT" | "PAYMENT";
  amount: string | number;
  description: string;
  userId: string;
  userName: string;
}) {
  const amount = d(params.amount);
  if (amount.lte(0)) throw new BusinessRuleError("O valor deve ser maior que zero.");
  if (!params.description?.trim()) {
    throw new BusinessRuleError("Informe a descrição/motivo da movimentação.");
  }

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(cashSessions).where(eq(cashSessions.id, params.sessionId)).limit(1);
    const session = rows[0];
    if (!session) throw new NotFoundError("Caixa");
    if (session.status !== "OPEN") {
      throw new BusinessRuleError("Este caixa está fechado e não aceita movimentações.");
    }

    const signed =
      params.type === "WITHDRAWAL" || params.type === "PAYMENT"
        ? amount.negated()
        : amount;

    const [movement] = await tx
      .insert(cashMovements)
      .values({
        sessionId: session.id,
        type: params.type,
        method: "CASH",
        amount: money(signed),
        description: params.description,
        referenceType: "MANUAL",
        userId: params.userId,
        userName: params.userName,
      })
      .returning();

    await writeAudit({
      userId: params.userId,
      userName: params.userName,
      action: `CASH_${params.type}`,
      entity: "cash_session",
      entityId: session.id,
      description: `${params.type === "WITHDRAWAL" ? "Sangria" : params.type === "SUPPLY" ? "Suprimento" : params.type} de R$ ${money(amount)} no caixa ${session.code}: ${params.description}`,
    });

    return movement;
  });
}

export type CashSummary = {
  sessionId: string;
  code: string;
  openingAmount: string;
  cashIn: string;
  cashOut: string;
  expectedCash: string;
  byMethod: Array<{ method: string; label: string; total: string }>;
  salesTotal: string;
  withdrawals: string;
  supplies: string;
  refunds: string;
  movements: Array<{
    id: string;
    type: string;
    method: string | null;
    amount: string;
    description: string | null;
    userName: string | null;
    createdAt: string;
  }>;
};

export async function getSessionSummary(sessionId: string): Promise<CashSummary> {
  const rows = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).limit(1);
  const session = rows[0];
  if (!session) throw new NotFoundError("Caixa");

  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId))
    .orderBy(cashMovements.createdAt);

  let cashIn = d(session.openingAmount);
  let cashOut = d(0);
  const methodTotals = new Map<string, ReturnType<typeof d>>();
  let withdrawals = d(0);
  let supplies = d(0);
  let refunds = d(0);
  let salesTotal = d(0);

  for (const m of movements) {
    const amount = d(m.amount);
    if (m.type === "OPENING") continue;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (amount.gte(0)) {
      cashIn = cashIn.plus(amount);
      if (m.type === "SUPPLY") supplies = supplies.plus(amount);
      if (m.type === "SALE") salesTotal = salesTotal.plus(amount);
    } else {
      cashOut = cashOut.plus(amount.abs());
      if (m.type === "WITHDRAWAL") withdrawals = withdrawals.plus(amount.abs());
      if (m.type === "REFUND") refunds = refunds.plus(amount.abs());
    }
    if (m.method && !["WITHDRAWAL", "SUPPLY"].includes(m.type)) {
      const current = methodTotals.get(m.method) ?? d(0);
      methodTotals.set(m.method, current.plus(amount));
    }
  }

  const expectedCash = cashIn.minus(cashOut);

  return {
    sessionId: session.id,
    code: session.code,
    openingAmount: money(session.openingAmount),
    cashIn: money(cashIn),
    cashOut: money(cashOut),
    expectedCash: money(expectedCash),
    byMethod: [...methodTotals.entries()].map(([method, total]) => ({
      method,
      label: METHOD_LABELS[method] ?? method,
      total: money(total),
    })),
    salesTotal: money(salesTotal),
    withdrawals: money(withdrawals),
    supplies: money(supplies),
    refunds: money(refunds),
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      method: m.method,
      amount: money(m.amount),
      description: m.description,
      userName: m.userName,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function closeSession(params: {
  sessionId: string;
  countedBreakdown: Record<string, number>;
  notes?: string;
  userId: string;
  userName: string;
}) {
  const summary = await getSessionSummary(params.sessionId);
  const rows = await db.select().from(cashSessions).where(eq(cashSessions.id, params.sessionId)).limit(1);
  const session = rows[0];
  if (!session) throw new NotFoundError("Caixa");
  if (session.status !== "OPEN") throw new BusinessRuleError("Este caixa já está fechado.");

  const counted = Object.values(params.countedBreakdown ?? {}).reduce(
    (acc, v) => acc.plus(d(v)),
    d(0),
  );
  const expected = d(summary.expectedCash);
  const difference = counted.minus(expected);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(cashSessions)
      .set({
        status: "CLOSED",
        countedAmount: money(counted),
        expectedAmount: money(expected),
        difference: money(difference),
        countedBreakdown: params.countedBreakdown,
        closedAt: new Date(),
        closedBy: params.userId,
        closingNotes: params.notes ?? null,
        salesTotal: summary.salesTotal,
      })
      .where(eq(cashSessions.id, session.id))
      .returning();

    await writeAudit({
      userId: params.userId,
      userName: params.userName,
      action: "CASH_CLOSE",
      entity: "cash_session",
      entityId: session.id,
      description: `Caixa ${session.code} fechado. Esperado R$ ${money(expected)}, contado R$ ${money(counted)}, diferença R$ ${money(difference)}`,
      after: { counted: money(counted), expected: money(expected), difference: money(difference) },
    }, tx);

    return { session: updated, summary, difference: money(difference), counted: money(counted) };
  });
}

export async function listSessions(params: { limit?: number; onlyOpen?: boolean } = {}) {
  const conditions = [];
  if (params.onlyOpen) conditions.push(eq(cashSessions.status, "OPEN"));
  return db
    .select()
    .from(cashSessions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${cashSessions.openedAt} DESC`)
    .limit(params.limit ?? 50);
}

export async function cashBalanceToday() {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(opening_amount), 0)::text` })
    .from(cashSessions)
    .where(eq(cashSessions.status, "OPEN"));
  const opening = money(rows[0]?.total ?? 0);
  const openIds = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(eq(cashSessions.status, "OPEN"));
  let balance = d(opening);
  for (const s of openIds) {
    const s2 = await getSessionSummary(s.id);
    balance = balance.plus(d(s2.cashIn)).minus(d(s2.cashOut));
  }
  return money(balance);
}

void sum;
