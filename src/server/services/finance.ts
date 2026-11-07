/**
 * Serviço financeiro — contas a pagar/receber, baixas parciais, crediário,
 * fluxo de caixa, DRE gerencial e renegociação de dívidas.
 *
 * Princípios:
 *  - Lançamentos financeiros NUNCA são apagados; são cancelados com motivo.
 *  - Baixas parciais atualizam status para PARTIAL e permitem múltiplos
 *    recebimentos por parcela (finance_entries mantém o histórico).
 *  - Multa e juros de atraso são calculados com os parâmetros configurados
 *    (Configurações > Crediário) e registrados na própria parcela.
 */
import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  bankAccounts,
  cashMovements,
  cashSessions,
  creditRenegotiations,
  customers,
  financeEntries,
  payables,
  receivables,
  sales,
} from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { calculateLateCharges, d, money, splitInstallments } from "../lib/money";
import { addDaysKey, addMonthsKey, todayKey } from "../lib/dates";
import { getSettingsCached } from "./settings";
import { writeAudit } from "../lib/audit";

export type Actor = { id: string; name: string };

/* ============================= CONTAS A PAGAR ============================= */

export async function createPayable(params: {
  description: string;
  amount: string;
  dueDate: string;
  supplierId?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  bankAccountId?: string | null;
  documentNumber?: string | null;
  installments?: number;
  purchaseOrderId?: string | null;
  notes?: string | null;
  actor: Actor;
}) {
  const amount = d(params.amount);
  if (amount.lte(0)) throw new BusinessRuleError("O valor deve ser maior que zero.");
  const installments = Math.max(1, Math.trunc(params.installments ?? 1));
  const parcels = splitInstallments(amount, installments);

  const created = [];
  for (let i = 0; i < parcels.length; i++) {
    const row = await db
      .insert(payables)
      .values({
        description:
          installments > 1
            ? `${params.description} (${i + 1}/${installments})`
            : params.description,
        amount: parcels[i],
        dueDate: i === 0 ? params.dueDate : addMonthsKey(params.dueDate, i),
        supplierId: params.supplierId ?? null,
        categoryId: params.categoryId ?? null,
        costCenterId: params.costCenterId ?? null,
        bankAccountId: params.bankAccountId ?? null,
        documentNumber: params.documentNumber ?? null,
        installmentNumber: i + 1,
        installmentTotal: installments,
        purchaseOrderId: params.purchaseOrderId ?? null,
        notes: params.notes ?? null,
        createdBy: params.actor.id,
      })
      .returning();
    created.push(row[0]);
  }

  await writeAudit({
    userId: params.actor.id,
    userName: params.actor.name,
    action: "PAYABLE_CREATE",
    entity: "payable",
    entityId: created[0]?.id,
    description: `Conta a pagar "${params.description}" — R$ ${money(amount)} em ${installments}x`,
  });

  return created;
}

export async function payPayable(params: {
  payableId: string;
  amount: string | number;
  method: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "TRANSFER" | "OTHER";
  bankAccountId?: string | null;
  paidAt?: string;
  notes?: string;
  actor: Actor;
}) {
  const rows = await db.select().from(payables).where(eq(payables.id, params.payableId)).limit(1);
  const payable = rows[0];
  if (!payable) throw new NotFoundError("Conta a pagar");
  if (payable.status === "PAID") throw new BusinessRuleError("Esta conta já está paga.");
  if (payable.status === "CANCELED") throw new BusinessRuleError("Esta conta está cancelada.");

  const amount = d(params.amount);
  const remaining = d(payable.amount).minus(d(payable.paidAmount));
  if (amount.lte(0)) throw new BusinessRuleError("Informe um valor maior que zero.");
  if (amount.gt(remaining.plus(0.005))) {
    throw new BusinessRuleError(
      `O valor informado (R$ ${money(amount)}) excede o saldo devedor (R$ ${money(remaining)}).`,
    );
  }

  const newPaid = d(payable.paidAmount).plus(amount);
  const fullyPaid = newPaid.gte(d(payable.amount).minus(0.005));

  return db.transaction(async (tx) => {
    await tx.insert(financeEntries).values({
      kind: "PAYMENT",
      payableId: payable.id,
      amount: money(amount),
      method: params.method,
      bankAccountId: params.bankAccountId ?? null,
      paidAt: params.paidAt ? new Date(params.paidAt) : new Date(),
      notes: params.notes ?? null,
      userId: params.actor.id,
      userName: params.actor.name,
    });

    const [updated] = await tx
      .update(payables)
      .set({
        paidAmount: money(newPaid),
        status: fullyPaid ? "PAID" : "PARTIAL",
        paidAt: fullyPaid ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(payables.id, payable.id))
      .returning();

    // Movimento de caixa quando pago em espécie com caixa aberto
    if (params.method === "CASH") {
      const session = await tx
        .select()
        .from(cashSessions)
        .where(and(eq(cashSessions.status, "OPEN"), eq(cashSessions.userId, params.actor.id)))
        .limit(1);
      if (session[0]) {
        await tx.insert(cashMovements).values({
          sessionId: session[0].id,
          type: "PAYMENT",
          method: "CASH",
          amount: money(amount.negated()),
          description: `Pagamento: ${payable.description}`,
          referenceType: "PAYABLE",
          referenceId: payable.id,
          userId: params.actor.id,
          userName: params.actor.name,
        });
      }
    }

    // Atualiza saldo da conta bancária
    if (params.bankAccountId) {
      await tx.execute(sql`
        UPDATE bank_accounts SET current_balance = current_balance - ${money(amount)}::numeric
        WHERE id = ${params.bankAccountId}
      `);
    }

    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "PAYABLE_PAY",
      entity: "payable",
      entityId: payable.id,
      description: `Pagamento de R$ ${money(amount)} em "${payable.description}"`,
      before: { paidAmount: payable.paidAmount, status: payable.status },
      after: { paidAmount: money(newPaid), status: fullyPaid ? "PAID" : "PARTIAL" },
    }, tx);

    return updated;
  });
}

export async function cancelPayable(id: string, reason: string, actor: Actor) {
  if (!reason?.trim()) throw new BusinessRuleError("Informe o motivo do cancelamento.");
  const rows = await db.select().from(payables).where(eq(payables.id, id)).limit(1);
  const payable = rows[0];
  if (!payable) throw new NotFoundError("Conta a pagar");
  if (payable.status === "PAID") {
    throw new BusinessRuleError("Não é possível cancelar uma conta já paga.");
  }
  const [updated] = await db
    .update(payables)
    .set({ status: "CANCELED", canceledReason: reason, updatedAt: new Date() })
    .where(eq(payables.id, id))
    .returning();
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "PAYABLE_CANCEL",
    entity: "payable",
    entityId: id,
    description: `Conta a pagar cancelada: ${reason}`,
  });
  return updated;
}

export async function listPayables(params: {
  status?: string;
  from?: string;
  to?: string;
  supplierId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const conds = [];
  if (params.status && params.status !== "ALL") conds.push(eq(payables.status, params.status as never));
  if (params.from) conds.push(gte(payables.dueDate, params.from));
  if (params.to) conds.push(lte(payables.dueDate, params.to));
  if (params.supplierId) conds.push(eq(payables.supplierId, params.supplierId));
  if (params.search) conds.push(sql`lower(${payables.description}) LIKE ${`%${params.search.toLowerCase()}%`}`);
  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 25);

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(payables)
      .where(where)
      .orderBy(asc(payables.dueDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${payables.amount}), 0)::text`,
        open: sql<string>`COALESCE(SUM(CASE WHEN ${payables.status} IN ('PENDING','PARTIAL') THEN ${payables.amount} - ${payables.paidAmount} ELSE 0 END), 0)::text`,
      })
      .from(payables)
      .where(where),
  ]);

  return { items, total: Number(totals[0]?.count ?? 0), totals: totals[0], page, pageSize };
}

/* ============================ CONTAS A RECEBER ============================ */

export async function listReceivables(params: {
  status?: string;
  from?: string;
  to?: string;
  customerId?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const today = todayKey();
  const conds = [];
  if (params.status && params.status !== "ALL") conds.push(eq(receivables.status, params.status as never));
  if (params.from) conds.push(gte(receivables.dueDate, params.from));
  if (params.to) conds.push(lte(receivables.dueDate, params.to));
  if (params.customerId) conds.push(eq(receivables.customerId, params.customerId));
  if (params.overdueOnly) {
    conds.push(lt(receivables.dueDate, today));
    conds.push(sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 25);

  const [items, totals] = await Promise.all([
    db
      .select({
        receivable: receivables,
        customerName: customers.name,
        customerPhone: customers.phone,
        saleNumber: sales.number,
      })
      .from(receivables)
      .leftJoin(customers, eq(customers.id, receivables.customerId))
      .leftJoin(sales, eq(sales.id, receivables.saleId))
      .where(where)
      .orderBy(asc(receivables.dueDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${receivables.amount}), 0)::text`,
        open: sql<string>`COALESCE(SUM(CASE WHEN ${receivables.status} IN ('PENDING','PARTIAL','OVERDUE') THEN ${receivables.amount} - ${receivables.paidAmount} ELSE 0 END), 0)::text`,
      })
      .from(receivables)
      .where(where),
  ]);

  return { items, total: Number(totals[0]?.count ?? 0), totals: totals[0], page, pageSize };
}

/** Calcula encargos atuais de um recebível (multa + juros). */
export async function receivableCharges(receivableId: string) {
  const settings = await getSettingsCached();
  const rows = await db.select().from(receivables).where(eq(receivables.id, receivableId)).limit(1);
  const r = rows[0];
  if (!r) throw new NotFoundError("Parcela");
  const outstanding = d(r.amount).minus(d(r.paidAmount));
  const charges = calculateLateCharges({
    amount: outstanding,
    dueDate: r.dueDate,
    penaltyPercent: settings.creditPenaltyRate,
    dailyInterestPercent: settings.creditDailyInterest,
    graceDays: settings.creditGraceDays,
  });
  return {
    receivable: r,
    outstanding: money(outstanding),
    ...charges,
    totalWithCharges: charges.total,
  };
}

export async function receiveReceivable(params: {
  receivableId: string;
  amount: string | number;
  method: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "TRANSFER" | "OTHER";
  bankAccountId?: string | null;
  applyCharges?: boolean;
  notes?: string;
  actor: Actor;
}) {
  const rows = await db.select().from(receivables).where(eq(receivables.id, params.receivableId)).limit(1);
  const r = rows[0];
  if (!r) throw new NotFoundError("Parcela");
  if (r.status === "PAID") throw new BusinessRuleError("Esta parcela já foi recebida.");
  if (r.status === "CANCELED") throw new BusinessRuleError("Esta parcela está cancelada.");

  const settings = await getSettingsCached();
  const outstanding = d(r.amount).minus(d(r.paidAmount));
  const charges = params.applyCharges
    ? calculateLateCharges({
        amount: outstanding,
        dueDate: r.dueDate,
        penaltyPercent: settings.creditPenaltyRate,
        dailyInterestPercent: settings.creditDailyInterest,
        graceDays: settings.creditGraceDays,
      })
    : { penalty: "0.00", interest: "0.00", total: money(outstanding), daysLate: 0 };

  const amount = d(params.amount);
  if (amount.lte(0)) throw new BusinessRuleError("Informe um valor maior que zero.");
  const maxAmount = d(charges.total);
  if (amount.gt(maxAmount.plus(0.005))) {
    throw new BusinessRuleError(
      `O valor (R$ ${money(amount)}) excede o total devido (R$ ${money(maxAmount)}).`,
    );
  }

  const newPaid = d(r.paidAmount).plus(amount.gt(outstanding) ? outstanding : amount);
  const fullyPaid = newPaid.gte(d(r.amount).minus(0.005));

  return db.transaction(async (tx) => {
    await tx.insert(financeEntries).values({
      kind: "RECEIPT",
      receivableId: r.id,
      amount: money(amount),
      method: params.method,
      bankAccountId: params.bankAccountId ?? null,
      notes: params.notes ?? null,
      userId: params.actor.id,
      userName: params.actor.name,
    });

    const [updated] = await tx
      .update(receivables)
      .set({
        paidAmount: money(newPaid),
        penaltyAmount: money(d(r.penaltyAmount).plus(charges.penalty)),
        interestAmount: money(d(r.interestAmount).plus(charges.interest)),
        status: fullyPaid ? "PAID" : "PARTIAL",
        paidAt: fullyPaid ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(receivables.id, r.id))
      .returning();

    // Entrada em caixa (dinheiro) ou conta bancária
    const session = await tx
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.status, "OPEN"), eq(cashSessions.userId, params.actor.id)))
      .limit(1);
    if (params.method === "CASH" && session[0]) {
      await tx.insert(cashMovements).values({
        sessionId: session[0].id,
        type: "RECEIPT",
        method: "CASH",
        amount: money(amount),
        description: `Recebimento crediário — ${r.description ?? `Parcela ${r.installmentNumber}/${r.installmentTotal}`}`,
        referenceType: "RECEIVABLE",
        referenceId: r.id,
        userId: params.actor.id,
        userName: params.actor.name,
      });
    }
    if (params.bankAccountId) {
      await tx.execute(sql`
        UPDATE bank_accounts SET current_balance = current_balance + ${money(amount)}::numeric
        WHERE id = ${params.bankAccountId}
      `);
    }

    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "RECEIVABLE_RECEIVE",
      entity: "receivable",
      entityId: r.id,
      description: `Recebimento de R$ ${money(amount)} (${params.method})`,
      before: { paidAmount: r.paidAmount, status: r.status },
      after: { paidAmount: money(newPaid), status: fullyPaid ? "PAID" : "PARTIAL" },
    }, tx);

    return updated;
  });
}

/** Recalcula status OVERDUE para parcelas vencidas (job leve). */
export async function refreshOverdueReceivables() {
  await db.execute(sql`
    UPDATE receivables
       SET status = 'OVERDUE', updated_at = now()
     WHERE due_date < CURRENT_DATE
       AND status IN ('PENDING','PARTIAL')
  `);
}

/* ============================== CREDIÁRIO ============================== */

export async function creditDashboard() {
  const today = todayKey();
  const rows = await db
    .select({
      totalOpen: sql<string>`COALESCE(SUM(CASE WHEN status IN ('PENDING','PARTIAL','OVERDUE') THEN amount - paid_amount ELSE 0 END), 0)::text`,
      totalOverdue: sql<string>`COALESCE(SUM(CASE WHEN status IN ('PENDING','PARTIAL','OVERDUE') AND due_date < ${today} THEN amount - paid_amount ELSE 0 END), 0)::text`,
      totalUpcoming: sql<string>`COALESCE(SUM(CASE WHEN status IN ('PENDING','PARTIAL') AND due_date >= ${today} THEN amount - paid_amount ELSE 0 END), 0)::text`,
      paidCount: sql<number>`COUNT(*) FILTER (WHERE status = 'PAID')::int`,
      pendingCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('PENDING','PARTIAL','OVERDUE'))::int`,
      overdueCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('PENDING','PARTIAL','OVERDUE') AND due_date < ${today})::int`,
    })
    .from(receivables);

  const delinquent = await db
    .select({
      customerId: receivables.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      total: sql<string>`SUM(${receivables.amount} - ${receivables.paidAmount})::text`,
      installments: sql<number>`COUNT(*)::int`,
      oldestDue: sql<string>`MIN(${receivables.dueDate})::text`,
    })
    .from(receivables)
    .leftJoin(customers, eq(customers.id, receivables.customerId))
    .where(and(lt(receivables.dueDate, today), sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`))
    .groupBy(receivables.customerId, customers.name, customers.phone)
    .orderBy(desc(sql`SUM(${receivables.amount} - ${receivables.paidAmount})`))
    .limit(50);

  return { totals: rows[0], delinquents: delinquent };
}

export async function renegotiate(params: {
  customerId: string;
  receivableIds: string[];
  installments: number;
  firstDueDate: string;
  notes?: string;
  actor: Actor;
}) {
  const settings = await getSettingsCached();
  if (!params.receivableIds.length) throw new BusinessRuleError("Selecione as parcelas a renegociar.");
  const installments = Math.max(1, Math.trunc(params.installments));

  const rows = await db
    .select()
    .from(receivables)
    .where(and(eq(receivables.customerId, params.customerId), sql`${receivables.id} = ANY(${sql.raw(`ARRAY['${params.receivableIds.join("','")}']::uuid[]`)})`));

  if (!rows.length) throw new BusinessRuleError("Nenhuma parcela válida selecionada.");
  for (const r of rows) {
    if (r.status === "PAID" || r.status === "CANCELED") {
      throw new BusinessRuleError("Parcelas pagas ou canceladas não podem ser renegociadas.");
    }
  }

  let original = d(0);
  let interest = d(0);
  let penalty = d(0);
  for (const r of rows) {
    const outstanding = d(r.amount).minus(d(r.paidAmount));
    original = original.plus(outstanding);
    const charges = calculateLateCharges({
      amount: outstanding,
      dueDate: r.dueDate,
      penaltyPercent: settings.creditPenaltyRate,
      dailyInterestPercent: settings.creditDailyInterest,
      graceDays: settings.creditGraceDays,
    });
    interest = interest.plus(charges.interest);
    penalty = penalty.plus(charges.penalty);
  }
  const newAmount = original.plus(interest).plus(penalty);

  return db.transaction(async (tx) => {
    const [reneg] = await tx
      .insert(creditRenegotiations)
      .values({
        customerId: params.customerId,
        originalAmount: money(original),
        interestAmount: money(interest),
        penaltyAmount: money(penalty),
        newAmount: money(newAmount),
        installments,
        firstDueDate: params.firstDueDate,
        notes: params.notes ?? null,
        receivablesIds: rows.map((r) => r.id),
        userId: params.actor.id,
      })
      .returning();

    await tx.execute(sql`
      UPDATE receivables SET status = 'RENEGOTIATED', updated_at = now(),
        renegotiation_id = ${reneg.id}
      WHERE id = ANY(${sql.raw(`ARRAY['${rows.map((r) => r.id).join("','")}']::uuid[]`)})
    `);

    const parcels = splitInstallments(newAmount, installments);
    for (let i = 0; i < parcels.length; i++) {
      await tx.insert(receivables).values({
        customerId: params.customerId,
        source: "RENEGOTIATION",
        description: `Renegociação ${reneg.id.slice(0, 8)} — parcela ${i + 1}/${installments}`,
        installmentNumber: i + 1,
        installmentTotal: installments,
        amount: parcels[i],
        dueDate: i === 0 ? params.firstDueDate : addMonthsKey(params.firstDueDate, i),
        status: "PENDING",
        renegotiationId: reneg.id,
        createdBy: params.actor.id,
      });
    }

    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "CREDIT_RENEGOTIATE",
      entity: "credit_renegotiation",
      entityId: reneg.id,
      description: `Renegociação de R$ ${money(original)} para ${installments}x de R$ ${money(newAmount)}`,
    });

    return reneg;
  });
}

/* ========================= FLUXO DE CAIXA / DRE ========================= */

export async function cashFlow(params: { from: string; to: string }) {
  const [receipts, payments, salesIncome] = await Promise.all([
    db
      .select({
        total: sql<string>`COALESCE(SUM(${financeEntries.amount}), 0)::text`,
      })
      .from(financeEntries)
      .where(
        and(
          eq(financeEntries.kind, "RECEIPT"),
          gte(financeEntries.paidAt, new Date(`${params.from}T00:00:00Z`)),
          lt(financeEntries.paidAt, new Date(`${addDaysKey(params.to, 1)}T00:00:00Z`)),
        ),
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${financeEntries.amount}), 0)::text`,
      })
      .from(financeEntries)
      .where(
        and(
          eq(financeEntries.kind, "PAYMENT"),
          gte(financeEntries.paidAt, new Date(`${params.from}T00:00:00Z`)),
          lt(financeEntries.paidAt, new Date(`${addDaysKey(params.to, 1)}T00:00:00Z`)),
        ),
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.status, "COMPLETED"),
          gte(sales.completedAt, new Date(`${params.from}T00:00:00Z`)),
          lt(sales.completedAt, new Date(`${addDaysKey(params.to, 1)}T00:00:00Z`)),
        ),
      ),
  ]);

  const dailyRows = await db.execute(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day,
           COALESCE(SUM(CASE WHEN tipo = 'IN' THEN amount ELSE 0 END), 0)::text AS entradas,
           COALESCE(SUM(CASE WHEN tipo = 'OUT' THEN amount ELSE 0 END), 0)::text AS saidas
      FROM (
        SELECT date_trunc('day', created_at) AS day, 'SALE' AS tipo, total AS amount
          FROM sales
         WHERE status = 'COMPLETED'
           AND completed_at >= ${`${params.from}T00:00:00Z`}::timestamptz
           AND completed_at < ${`${addDaysKey(params.to, 1)}T00:00:00Z`}::timestamptz
        UNION ALL
        SELECT date_trunc('day', paid_at) AS day, 'IN' AS tipo, amount
          FROM finance_entries WHERE kind = 'RECEIPT'
           AND paid_at >= ${`${params.from}T00:00:00Z`}::timestamptz
           AND paid_at < ${`${addDaysKey(params.to, 1)}T00:00:00Z`}::timestamptz
        UNION ALL
        SELECT date_trunc('day', paid_at) AS day, 'OUT' AS tipo, amount
          FROM finance_entries WHERE kind = 'PAYMENT'
           AND paid_at >= ${`${params.from}T00:00:00Z`}::timestamptz
           AND paid_at < ${`${addDaysKey(params.to, 1)}T00:00:00Z`}::timestamptz
        UNION ALL
        SELECT date_trunc('day', due_date::timestamp) AS day, 'OUT' AS tipo,
               (amount - paid_amount)
          FROM payables
         WHERE status IN ('PENDING','PARTIAL')
           AND due_date >= ${params.from}
           AND due_date <= ${params.to}
      ) t
     GROUP BY day
     ORDER BY day
  `);

  return {
    receipts: money(receipts[0]?.total ?? 0),
    payments: money(payments[0]?.total ?? 0),
    salesTotal: money(salesIncome[0]?.total ?? 0),
    salesCount: Number(salesIncome[0]?.count ?? 0),
    balance: money(d(receipts[0]?.total ?? 0).minus(d(payments[0]?.total ?? 0))),
    daily: (dailyRows.rows as Array<{ day: string; entradas: string; saidas: string }>).map((r) => ({
      day: r.day,
      entradas: money(r.entradas),
      saidas: money(r.saidas),
    })),
  };
}

/**
 * DRE gerencial por período.
 * Receita bruta = vendas concluídas (não canceladas)
 * Deduções = devoluções/cancelamentos (categoria DEDUCTION com movimento)
 * CMV = custo dos itens vendidos (sale_items.unit_cost * quantity)
 */
export async function dre(params: { from: string; to: string }) {
  const fromTs = new Date(`${params.from}T00:00:00Z`);
  const toTs = new Date(`${addDaysKey(params.to, 1)}T00:00:00Z`);

  const revenueRows = await db
    .select({
      gross: sql<string>`COALESCE(SUM(${sales.total}), 0)::text`,
      count: sql<number>`COUNT(*)::int`,
      discounts: sql<string>`COALESCE(SUM(${sales.discountAmount}), 0)::text`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, "COMPLETED"),
        gte(sales.completedAt, fromTs),
        lt(sales.completedAt, toTs),
      ),
    );

  const cogsRows = await db.execute(sql`
    SELECT COALESCE(SUM(unit_cost * (quantity - returned_qty)), 0)::text AS cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED'
       AND s.completed_at >= ${fromTs}
       AND s.completed_at < ${toTs}
  `);

  const expenseRows = await db.execute(sql`
    SELECT COALESCE(SUM(fe.amount), 0)::text AS total
      FROM finance_entries fe
      JOIN payables p ON p.id = fe.payable_id
     WHERE fe.kind = 'PAYMENT'
       AND p.category_id IN (
         SELECT id FROM finance_categories WHERE dre_group = 'OPERATING_EXPENSE'
       )
       AND fe.paid_at >= ${fromTs} AND fe.paid_at < ${toTs}
  `);

  const otherRows = await db.execute(sql`
    SELECT fc.dre_group, COALESCE(SUM(fe.amount), 0)::text AS total
      FROM finance_entries fe
      LEFT JOIN payables p ON p.id = fe.payable_id
      LEFT JOIN receivables r ON r.id = fe.receivable_id
      LEFT JOIN finance_categories fc ON fc.id = p.category_id
     WHERE fe.kind = 'PAYMENT'
       AND fe.paid_at >= ${fromTs} AND fe.paid_at < ${toTs}
     GROUP BY fc.dre_group
  `);

  const gross = d(revenueRows[0]?.gross ?? 0);
  const deductions = await db.execute(sql`
    SELECT COALESCE(SUM(returned_total), 0)::text AS total
      FROM returns
     WHERE created_at >= ${fromTs} AND created_at < ${toTs}
  `);
  const deductionTotal = d((deductions.rows as Array<{ total: string }>)[0]?.total ?? 0);
  const cogs = d((cogsRows.rows as Array<{ cogs: string }>)[0]?.cogs ?? 0);
  const netRevenue = gross.minus(deductionTotal);
  const grossProfit = netRevenue.minus(cogs);

  const operatingExpenses = (otherRows.rows as Array<{ dre_group: string | null; total: string }>)
    .filter((r) => r.dre_group === "OPERATING_EXPENSE")
    .reduce((acc, r) => acc.plus(d(r.total)), d(0));
  const otherExpenses = (otherRows.rows as Array<{ dre_group: string | null; total: string }>)
    .filter((r) => r.dre_group === "OTHER_EXPENSE")
    .reduce((acc, r) => acc.plus(d(r.total)), d(0));
  const otherIncome = (otherRows.rows as Array<{ dre_group: string | null; total: string }>)
    .filter((r) => r.dre_group === "OTHER_INCOME")
    .reduce((acc, r) => acc.plus(d(r.total)), d(0));

  const operatingResult = grossProfit.minus(operatingExpenses);
  const finalResult = operatingResult.plus(otherIncome).minus(otherExpenses);

  void expenseRows;

  return {
    period: params,
    grossRevenue: money(gross),
    deductions: money(deductionTotal),
    netRevenue: money(netRevenue),
    cogs: money(cogs),
    grossProfit: money(grossProfit),
    grossMargin: netRevenue.gt(0) ? Number(grossProfit.dividedBy(netRevenue).times(100).toFixed(2)) : 0,
    operatingExpenses: money(operatingExpenses),
    operatingResult: money(operatingResult),
    otherIncome: money(otherIncome),
    otherExpenses: money(otherExpenses),
    finalResult: money(finalResult),
    netMargin: netRevenue.gt(0) ? Number(finalResult.dividedBy(netRevenue).times(100).toFixed(2)) : 0,
    salesCount: Number(revenueRows[0]?.count ?? 0),
    discounts: money(revenueRows[0]?.discounts ?? 0),
  };
}

/* ========================= CONTA BANCÁRIA / TRANSFER ========================= */

export async function listBankAccounts() {
  return db.select().from(bankAccounts).where(eq(bankAccounts.isActive, true)).orderBy(bankAccounts.name);
}

export async function transferBetweenAccounts(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: string | number;
  date: string;
  notes?: string;
  actor: Actor;
}) {
  const amount = d(params.amount);
  if (amount.lte(0)) throw new BusinessRuleError("Valor inválido para transferência.");
  if (params.fromAccountId === params.toAccountId) {
    throw new BusinessRuleError("As contas de origem e destino devem ser diferentes.");
  }
  const { getSettings } = await import("./settings");
  void getSettings;
  return db.transaction(async (tx) => {
    const accounts = await tx
      .select()
      .from(bankAccounts)
      .where(sql`${bankAccounts.id} IN (${params.fromAccountId}, ${params.toAccountId})`);
    const from = accounts.find((a) => a.id === params.fromAccountId);
    const to = accounts.find((a) => a.id === params.toAccountId);
    if (!from || !to) throw new NotFoundError("Conta bancária");
    if (from.type !== "CASH" && d(from.currentBalance).lt(amount)) {
      // Aviso, mas permite (conciliação pode corrigir depois)
    }
    const { accountTransfers } = await import("../db/schema");
    const [transfer] = await tx
      .insert(accountTransfers)
      .values({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: money(amount),
        date: params.date,
        notes: params.notes ?? null,
        userId: params.actor.id,
      })
      .returning();
    await tx.execute(sql`UPDATE bank_accounts SET current_balance = current_balance - ${money(amount)}::numeric WHERE id = ${from.id}`);
    await tx.execute(sql`UPDATE bank_accounts SET current_balance = current_balance + ${money(amount)}::numeric WHERE id = ${to.id}`);
    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "ACCOUNT_TRANSFER",
      entity: "account_transfer",
      entityId: transfer.id,
      description: `Transferência de R$ ${money(amount)} de ${from.name} para ${to.name}`,
    }, tx);
    return transfer;
  });
}

/* ====================== PREVISÃO / DESPESAS RECORRENTES ====================== */

export async function financialForecast(params: { days?: number } = {}) {
  const days = params.days ?? 30;
  const today = todayKey();
  const until = addDaysKey(today, days);

  const [toPay, toReceive] = await Promise.all([
    db
      .select({
        total: sql<string>`COALESCE(SUM(${payables.amount} - ${payables.paidAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(payables)
      .where(
        and(
          lte(payables.dueDate, until),
          or(eq(payables.status, "PENDING"), eq(payables.status, "PARTIAL")),
        ),
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${receivables.amount} - ${receivables.paidAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(receivables)
      .where(
        and(
          lte(receivables.dueDate, until),
          or(
            eq(receivables.status, "PENDING"),
            eq(receivables.status, "PARTIAL"),
            eq(receivables.status, "OVERDUE"),
          ),
        ),
      ),
  ]);

  return {
    days,
    until,
    toPay: { total: money(toPay[0]?.total ?? 0), count: Number(toPay[0]?.count ?? 0) },
    toReceive: {
      total: money(toReceive[0]?.total ?? 0),
      count: Number(toReceive[0]?.count ?? 0),
    },
    projectedBalance: money(d(toReceive[0]?.total ?? 0).minus(d(toPay[0]?.total ?? 0))),
  };
}

export async function overdueSummary() {
  const today = todayKey();
  const [overduePayables, overdueReceivables] = await Promise.all([
    db
      .select({
        total: sql<string>`COALESCE(SUM(${payables.amount} - ${payables.paidAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(payables)
      .where(
        and(
          lt(payables.dueDate, today),
          or(eq(payables.status, "PENDING"), eq(payables.status, "PARTIAL")),
        ),
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${receivables.amount} - ${receivables.paidAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(receivables)
      .where(
        and(
          lt(receivables.dueDate, today),
          or(
            eq(receivables.status, "PENDING"),
            eq(receivables.status, "PARTIAL"),
            eq(receivables.status, "OVERDUE"),
          ),
        ),
      ),
  ]);
  return {
    payables: { total: money(overduePayables[0]?.total ?? 0), count: Number(overduePayables[0]?.count ?? 0) },
    receivables: {
      total: money(overdueReceivables[0]?.total ?? 0),
      count: Number(overdueReceivables[0]?.count ?? 0),
    },
  };
}

export async function customerBalanceStatement(customerId: string) {
  const customerRows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customerRows[0]) throw new NotFoundError("Cliente");
  const openItems = await db
    .select()
    .from(receivables)
    .where(
      and(
        eq(receivables.customerId, customerId),
        sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`,
      ),
    )
    .orderBy(asc(receivables.dueDate));
  const paidItems = await db
    .select()
    .from(receivables)
    .where(and(eq(receivables.customerId, customerId), eq(receivables.status, "PAID")))
    .orderBy(desc(receivables.paidAt))
    .limit(50);
  return { customer: customerRows[0], openItems, paidItems };
}

void isNull;
