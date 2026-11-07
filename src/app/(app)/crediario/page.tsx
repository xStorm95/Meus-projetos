import { redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { creditRenegotiations, customers, users } from "@/server/db/schema";
import { creditDashboard, listReceivables, refreshOverdueReceivables } from "@/server/services/finance";
import { getSettingsCached } from "@/server/services/settings";
import { CreditView } from "@/components/credit/credit-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crediário" };

export default async function CreditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("credit.view")) redirect("/");

  await refreshOverdueReceivables();

  const [dashboard, openList, settings, customerOptions, renegotiationRows, usageRows] = await Promise.all([
    creditDashboard(),
    listReceivables({ status: undefined, page: 1, pageSize: 200 }),
    getSettingsCached(),
    db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.isActive, true), isNull(customers.deletedAt)))
      .orderBy(asc(customers.name))
      .limit(1000),
    db
      .select({
        id: creditRenegotiations.id,
        customerName: customers.name,
        originalAmount: creditRenegotiations.originalAmount,
        newAmount: creditRenegotiations.newAmount,
        installments: creditRenegotiations.installments,
        firstDueDate: creditRenegotiations.firstDueDate,
        createdAt: creditRenegotiations.createdAt,
        userName: users.name,
      })
      .from(creditRenegotiations)
      .leftJoin(customers, eq(customers.id, creditRenegotiations.customerId))
      .leftJoin(users, eq(users.id, creditRenegotiations.userId))
      .orderBy(sql`${creditRenegotiations.createdAt} DESC`)
      .limit(50),
    db.execute(sql`
      SELECT c.id, c.name, c.phone, c.credit_limit::text,
             COALESCE(SUM(CASE WHEN r.status IN ('PENDING','PARTIAL','OVERDUE') THEN r.amount - r.paid_amount ELSE 0 END), 0)::text AS open_debt
        FROM customers c
        LEFT JOIN receivables r ON r.customer_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id, c.name, c.phone, c.credit_limit
       HAVING c.credit_limit > 0 OR COALESCE(SUM(CASE WHEN r.status IN ('PENDING','PARTIAL','OVERDUE') THEN r.amount - r.paid_amount ELSE 0 END), 0) > 0
       ORDER BY COALESCE(SUM(CASE WHEN r.status IN ('PENDING','PARTIAL','OVERDUE') THEN r.amount - r.paid_amount ELSE 0 END), 0) DESC
       LIMIT 200
    `),
  ]);

  // Somente parcelas em aberto na carteira
  const openInstallments = openList.items
    .filter((row) => ["PENDING", "PARTIAL", "OVERDUE"].includes(row.receivable.status))
    .map((row) => ({
      id: row.receivable.id,
      customerId: row.receivable.customerId,
      customerName: row.customerName,
      description: row.receivable.description,
      dueDate: row.receivable.dueDate,
      amount: row.receivable.amount,
      paidAmount: row.receivable.paidAmount,
      penaltyAmount: row.receivable.penaltyAmount,
      interestAmount: row.receivable.interestAmount,
      status: row.receivable.status,
      installmentNumber: row.receivable.installmentNumber,
      installmentTotal: row.receivable.installmentTotal,
      saleNumber: row.saleNumber,
    }));

  const usage = (usageRows.rows as Array<Record<string, unknown>>).map((r) => {
    const creditLimit = Number(r.credit_limit ?? 0);
    const openDebt = Number(r.open_debt ?? 0);
    return {
      customerId: String(r.id),
      name: String(r.name),
      phone: r.phone ? String(r.phone) : null,
      creditLimit: creditLimit.toFixed(2),
      openDebt: openDebt.toFixed(2),
      usagePercent: creditLimit > 0 ? (openDebt / creditLimit) * 100 : openDebt > 0 ? 100 : 0,
    };
  });

  return (
    <CreditView
      data={{
        totals: {
          totalOpen: dashboard.totals?.totalOpen ?? "0.00",
          totalOverdue: dashboard.totals?.totalOverdue ?? "0.00",
          totalUpcoming: dashboard.totals?.totalUpcoming ?? "0.00",
          paidCount: Number(dashboard.totals?.paidCount ?? 0),
          pendingCount: Number(dashboard.totals?.pendingCount ?? 0),
          overdueCount: Number(dashboard.totals?.overdueCount ?? 0),
        },
        delinquents: dashboard.delinquents.map((d) => ({
          customerId: d.customerId ?? "",
          customerName: d.customerName,
          customerPhone: d.customerPhone,
          total: d.total,
          installments: Number(d.installments ?? 0),
          oldestDue: d.oldestDue,
        })),
        installments: openInstallments,
        renegotiations: renegotiationRows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        settings: {
          penalty: settings.creditPenaltyRate,
          dailyInterest: settings.creditDailyInterest,
          graceDays: settings.creditGraceDays,
        },
        creditUsage: usage,
      }}
      customers={customerOptions}
      permissions={{
        canReceive: user.permissions.includes("finance.pay"),
        canRenegotiate: user.permissions.includes("credit.renegotiate"),
        canUpdateLimit: user.permissions.includes("credit.limit.update"),
        canExport: user.permissions.includes("reports.export"),
      }}
    />
  );
}

