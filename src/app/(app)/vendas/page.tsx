import { redirect } from "next/navigation";
import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { customers, sales, users } from "@/server/db/schema";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";
import { SalesView } from "./sales-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendas" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    status?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("sales.view")) redirect("/");

  const params = await searchParams;
  const preset = (params.period as PeriodPreset) || "thisMonth";
  const period = resolvePeriod(preset, params.from, params.to);
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 25;

  const conds = [
    gte(sales.createdAt, new Date(`${period.from}T00:00:00Z`)),
    lt(sales.createdAt, new Date(`${period.to}T23:59:59Z`)),
  ];
  if (params.status && params.status !== "ALL") {
    conds.push(eq(sales.status, params.status as never));
  }
  if (params.search) {
    const term = `%${params.search}%`;
    const num = Number(params.search.replace(/\D/g, ""));
    conds.push(
      or(
        ilike(customers.name, term),
        Number.isFinite(num) && num > 0 ? eq(sales.number, num) : undefined,
      )!,
    );
  }
  if (!user.permissions.includes("sales.view.all") && user.role !== "ADMIN" && user.role !== "MANAGER") {
    conds.push(eq(sales.sellerId, user.id));
  }
  const where = and(...conds);

  const [items, totals] = await Promise.all([
    db
      .select({
        id: sales.id,
        number: sales.number,
        status: sales.status,
        total: sales.total,
        profit: sales.profit,
        itemCount: sales.itemCount,
        createdAt: sales.createdAt,
        originType: sales.originType,
        customerName: customers.name,
        sellerName: users.name,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.sellerId))
      .where(where)
      .orderBy(desc(sales.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.total} ELSE 0 END), 0)::text`,
        profit: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.profit} ELSE 0 END), 0)::text`,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(where),
  ]);

  return (
    <SalesView
      initial={{
        items: items.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
        total: Number(totals[0]?.count ?? 0),
        summary: { total: totals[0]?.total ?? "0.00", profit: totals[0]?.profit ?? "0.00" },
        page,
        pageSize,
      }}
      filters={{
        from: period.from,
        to: period.to,
        status: params.status ?? "ALL",
        search: params.search ?? "",
        preset,
      }}
      permissions={{
        canCancel: user.permissions.includes("sales.cancel"),
        canExport: user.permissions.includes("reports.export"),
        canSeeProfit: user.permissions.includes("finance.view"),
      }}
    />
  );
}
