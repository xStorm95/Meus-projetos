import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listCustomers } from "@/server/services/customers";
import { CustomersView } from "./customers-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; classification?: string; birthdaysMonth?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("customers.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  const [data, summaryRows] = await Promise.all([
    listCustomers({
      search: params.search,
      classification: params.classification,
      birthdaysMonth: params.birthdaysMonth ? Number(params.birthdaysMonth) : undefined,
      page,
      pageSize: 20,
    }),
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
             COUNT(*) FILTER (WHERE to_char(birth_date, 'MM') = to_char(CURRENT_DATE, 'MM'))::int AS aniversariantes
        FROM base
    `),
  ]);

  const summary = (summaryRows.rows as Array<Record<string, number>>)[0] ?? {};

  return (
    <CustomersView
      initial={data}
      filters={{
        search: params.search ?? "",
        classification: params.classification ?? "ALL",
        birthdaysMonth: params.birthdaysMonth ?? "",
      }}
      canCreate={user.permissions.includes("customers.create")}
      canExport={user.permissions.includes("customers.export")}
      summary={{
        total: Number(summary.total ?? 0),
        vip: Number(summary.vip ?? 0),
        inactive: Number(summary.inativos ?? 0),
        delinquent: Number(summary.inadimplentes ?? 0),
        birthdays: Number(summary.aniversariantes ?? 0),
      }}
    />
  );
}
