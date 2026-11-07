import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { customerReports } from "@/server/services/customers";
import { money } from "@/server/lib/money";
import { CustomerReportsView } from "@/components/customers/customer-reports-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios de clientes" };

type ReportType = "INATIVOS30" | "INATIVOS60" | "INATIVOS90" | "TOP" | "ANIVERSARIANTES";

export default async function CustomerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("customers.view")) redirect("/");

  const params = await searchParams;
  const type = (params.type as ReportType) || "INATIVOS30";
  const month = Math.min(12, Math.max(1, Number(params.month ?? new Date().getMonth() + 1)));

  const [inactive30, inactive60, inactive90, top, birthdays, summaryRows] = await Promise.all([
    customerReports({ type: "inactive30" }),
    customerReports({ type: "inactive60" }),
    customerReports({ type: "inactive90" }),
    customerReports({ type: "top" }),
    customerReports({ type: "birthdays", month }),
    db.execute(sql`
      WITH base AS (
        SELECT c.id,
               (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED')::int AS compras,
               COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED'), 0)::numeric AS total,
               (SELECT MAX(s.completed_at) FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED') AS ultima,
               COALESCE((SELECT SUM(r.amount - r.paid_amount) FROM receivables r WHERE r.customer_id = c.id AND r.status IN ('PENDING','PARTIAL','OVERDUE') AND r.due_date < CURRENT_DATE), 0)::numeric AS vencido,
               c.birth_date
          FROM customers c WHERE c.deleted_at IS NULL
      )
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE total >= 1500 OR compras >= 8)::int AS vip,
             COUNT(*) FILTER (WHERE ultima IS NOT NULL AND ultima < now() - interval '90 days')::int AS inativos,
             COUNT(*) FILTER (WHERE vencido > 0)::int AS inadimplentes,
             COUNT(*) FILTER (WHERE to_char(birth_date, 'MM') = to_char(CURRENT_DATE, 'MM'))::int AS aniversariantes,
             COALESCE(AVG(NULLIF(total, 0)), 0)::text AS ticket
        FROM base
    `),
  ]);

  const s = (summaryRows.rows as Array<Record<string, unknown>>)[0] ?? {};

  return (
    <CustomerReportsView
      type={type}
      month={month}
      data={{
        inactive30: inactive30.items as never,
        inactive60: inactive60.items as never,
        inactive90: inactive90.items as never,
        top: top.items as never,
        birthdays: birthdays.items as never,
      }}
      summary={{
        total: Number(s.total ?? 0),
        vip: Number(s.vip ?? 0),
        inactive90: Number(s.inativos ?? 0),
        overdue: Number(s.inadimplentes ?? 0),
        birthdays: Number(s.aniversariantes ?? 0),
        ticketAverage: money(String(s.ticket ?? 0)),
      }}
    />
  );
}
