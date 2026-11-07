/**
 * Indicadores do dashboard — todos calculados a partir do banco,
 * respeitando o período selecionado e comparando com o período anterior.
 */
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { customers, productVariants, products, sales } from "../db/schema";
import { addDaysKey, daysBetween, previousPeriod, todayKey } from "../lib/dates";
import { d, money, pct } from "../lib/money";
import { cashBalanceToday } from "./cash";
import { overdueSummary } from "./finance";

export type DashboardResult = Awaited<ReturnType<typeof getDashboard>>;

function periodTs(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00Z`),
    lt: new Date(`${addDaysKey(to, 1)}T00:00:00Z`),
  };
}

export async function salesSummary(from: string, to: string) {
  const ts = periodTs(from, to);
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${sales.total}), 0)::text`,
      count: sql<number>`COUNT(*)::int`,
      items: sql<number>`COALESCE(SUM(${sales.itemCount}), 0)::int`,
      profit: sql<string>`COALESCE(SUM(${sales.profit}), 0)::text`,
      cost: sql<string>`COALESCE(SUM(${sales.costTotal}), 0)::text`,
      discounts: sql<string>`COALESCE(SUM(${sales.discountAmount}), 0)::text`,
    })
    .from(sales)
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.completedAt, ts.gte), lt(sales.completedAt, ts.lt)));
  const r = rows[0];
  const count = Number(r?.count ?? 0);
  const total = money(r?.total ?? 0);
  return {
    revenue: total,
    salesCount: count,
    itemCount: Number(r?.items ?? 0),
    profit: money(r?.profit ?? 0),
    cost: money(r?.cost ?? 0),
    discounts: money(r?.discounts ?? 0),
    ticketAverage: count > 0 ? money(d(total).dividedBy(count)) : "0.00",
  };
}

export async function getDashboard(params: { from: string; to: string }) {
  const { from, to } = params;
  const today = todayKey();
  const prev = previousPeriod(from, to);
  const ts = periodTs(from, to);
  const prevTs = periodTs(prev.from, prev.to);

  const [
    current,
    previous,
    todaySummary,
    monthSummary,
    revenueSeries,
    topProducts,
    lowStock,
    expenses,
    receivableTotals,
    payableTotals,
    customerStats,
    paymentMix,
    cashBalance,
    overdue,
    topCustomers,
    sellerPerformance,
  ] = await Promise.all([
    salesSummary(from, to),
    salesSummary(prev.from, prev.to),
    salesSummary(today, today),
    salesSummary(`${today.slice(0, 7)}-01`, today),

    db.execute(sql`
      SELECT to_char(day, 'DD/MM') AS label,
             to_char(day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(total), 0)::text AS receita,
             COUNT(*)::int AS vendas
        FROM (
          SELECT date_trunc('day', completed_at) AS day, total
            FROM sales
           WHERE status = 'COMPLETED'
             AND completed_at >= ${ts.gte} AND completed_at < ${ts.lt}
        ) t
       GROUP BY day ORDER BY day
    `),

    db.execute(sql`
      SELECT p.name, p.reference, pv.sku, pv.color_name, pv.size_name,
             SUM(si.quantity)::text AS qty,
             SUM(si.total)::text AS total,
             SUM(si.total - si.unit_cost * si.quantity)::text AS lucro
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        LEFT JOIN product_variants pv ON pv.id = si.variant_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY p.name, p.reference, pv.sku, pv.color_name, pv.size_name
       ORDER BY SUM(si.quantity) DESC
       LIMIT 10
    `),

    db
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        name: products.name,
        colorName: productVariants.colorName,
        sizeName: productVariants.sizeName,
        stockQty: productVariants.stockQty,
        lowStock: products.lowStock,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.status, "ACTIVE"),
          sql`${products.deletedAt} IS NULL`,
          eq(productVariants.isActive, true),
          sql`${productVariants.stockQty}::numeric <= ${products.lowStock}::numeric`,
        ),
      )
      .orderBy(productVariants.stockQty)
      .limit(12),

    db.execute(sql`
      SELECT COALESCE(SUM(fe.amount), 0)::text AS total, COUNT(*)::int AS lancamentos
        FROM finance_entries fe
       WHERE fe.kind = 'PAYMENT'
         AND fe.paid_at >= ${ts.gte} AND fe.paid_at < ${ts.lt}
    `),

    db.execute(sql`
      SELECT COALESCE(SUM(amount - paid_amount), 0)::text AS aberto,
             COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount - paid_amount ELSE 0 END), 0)::text AS vencido,
             COUNT(*)::int AS parcelas
        FROM receivables
       WHERE status IN ('PENDING','PARTIAL','OVERDUE')
    `),

    db.execute(sql`
      SELECT COALESCE(SUM(amount - paid_amount), 0)::text AS aberto,
             COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount - paid_amount ELSE 0 END), 0)::text AS vencido,
             COUNT(*)::int AS parcelas
        FROM payables
       WHERE status IN ('PENDING','PARTIAL')
    `),

    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE first_purchase >= ${ts.gte}::timestamptz)::int AS novos,
        COUNT(*) FILTER (WHERE purchases >= 2)::int AS recorrentes,
        COUNT(*) FILTER (WHERE last_purchase < (CURRENT_DATE - INTERVAL '90 days'))::int AS inativos,
        COUNT(*) FILTER (WHERE purchases >= 2)::int * 100.0 /
          NULLIF(COUNT(*), 0) AS taxa_recompra
      FROM (
        SELECT c.id,
               COUNT(s.id)::int AS purchases,
               MIN(s.completed_at) AS first_purchase,
               MAX(s.completed_at) AS last_purchase
          FROM customers c
          LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
         WHERE c.deleted_at IS NULL
         GROUP BY c.id
      ) t
    `),

    db.execute(sql`
      SELECT method, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::int AS qtd
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY method ORDER BY SUM(amount) DESC
    `),

    cashBalanceToday(),
    overdueSummary(),

    db.execute(sql`
      SELECT c.name, c.id,
             COUNT(s.id)::int AS compras,
             COALESCE(SUM(s.total), 0)::text AS total
        FROM customers c
        JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
       WHERE s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY c.id, c.name
       ORDER BY SUM(s.total) DESC
       LIMIT 5
    `),

    db.execute(sql`
      SELECT u.name, u.id,
             COUNT(s.id)::int AS vendas,
             COALESCE(SUM(s.total), 0)::text AS total
        FROM sales s
        JOIN users u ON u.id = s.seller_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY u.id, u.name
       ORDER BY SUM(s.total) DESC
       LIMIT 5
    `),
  ]);

  const variation = (curr: string, prevValue: string) => {
    const c = d(curr);
    const p = d(prevValue);
    if (p.isZero()) return c.isZero() ? 0 : 100;
    return Number(c.minus(p).dividedBy(p).times(100).toFixed(2));
  };

  const expenseTotal = money(
    (expenses.rows as Array<{ total: string }>)[0]?.total ?? 0,
  );
  const profitCurrent = d(current.revenue).minus(d(expenseTotal));

  const customerRow = (customerStats.rows as Array<{
    novos: number;
    recorrentes: number;
    inativos: number;
    taxa_recompra: string | null;
  }>)[0];

  return {
    period: { from, to, label: `${from} a ${to}`, days: daysBetween(from, to) + 1 },
    previousPeriod: prev,
    today: todaySummary,
    month: monthSummary,
    current,
    previous,
    variations: {
      revenue: variation(current.revenue, previous.revenue),
      salesCount: variation(String(current.salesCount), String(previous.salesCount)),
      ticketAverage: variation(current.ticketAverage, previous.ticketAverage),
      profit: variation(current.profit, previous.profit),
      itemCount: variation(String(current.itemCount), String(previous.itemCount)),
    },
    expenses: expenseTotal,
    estimatedResult: money(profitCurrent),
    receivables: {
      open: money((receivableTotals.rows as Array<{ aberto: string }>)[0]?.aberto ?? 0),
      overdue: money((receivableTotals.rows as Array<{ vencido: string }>)[0]?.vencido ?? 0),
      installments: Number((receivableTotals.rows as Array<{ parcelas: number }>)[0]?.parcelas ?? 0),
    },
    payables: {
      open: money((payableTotals.rows as Array<{ aberto: string }>)[0]?.aberto ?? 0),
      overdue: money((payableTotals.rows as Array<{ vencido: string }>)[0]?.vencido ?? 0),
      installments: Number((payableTotals.rows as Array<{ parcelas: number }>)[0]?.parcelas ?? 0),
    },
    cashBalance,
    overdue,
    chart: (revenueSeries.rows as Array<{ label: string; day: string; receita: string; vendas: number }>).map(
      (r) => ({
        label: r.label,
        day: r.day,
        revenue: Number(r.receita),
        sales: Number(r.vendas),
      }),
    ),
    topProducts: (
      topProducts.rows as Array<{
        name: string;
        reference: string;
        sku: string | null;
        color_name: string | null;
        size_name: string | null;
        qty: string;
        total: string;
        lucro: string;
      }>
    ).map((p) => ({
      name: p.name,
      reference: p.reference,
      variant: [p.color_name, p.size_name].filter(Boolean).join(" / ") || p.sku || "—",
      quantity: Number(p.qty),
      revenue: money(p.total),
      profit: money(p.lucro),
    })),
    lowStock: lowStock.map((v) => ({
      id: v.variantId,
      sku: v.sku,
      name: v.name,
      variation: [v.colorName, v.sizeName].filter(Boolean).join(" / ") || "—",
      quantity: Number(v.stockQty),
      minimum: Number(v.lowStock),
    })),
    customers: {
      new: Number(customerRow?.novos ?? 0),
      recurring: Number(customerRow?.recorrentes ?? 0),
      inactive: Number(customerRow?.inativos ?? 0),
      repurchaseRate: Number(customerRow?.taxa_recompra ?? 0),
    },
    paymentMix: (
      paymentMix.rows as Array<{ method: string; total: string; qtd: number }>
    ).map((p) => ({ method: p.method, total: money(p.total), count: Number(p.qtd) })),
    topCustomers: (
      topCustomers.rows as Array<{ id: string; name: string; compras: number; total: string }>
    ).map((c) => ({ id: c.id, name: c.name, purchases: Number(c.compras), total: money(c.total) })),
    sellers: (
      sellerPerformance.rows as Array<{ id: string; name: string; vendas: number; total: string }>
    ).map((s) => ({ id: s.id, name: s.name, sales: Number(s.vendas), total: money(s.total) })),
    marginPercent: Number(current.revenue) > 0
      ? pct(d(current.profit), current.revenue)
      : 0,
    recurrentRevenueShare: 0,
  };
}

export type SalesEvolutionPoint = { label: string; revenue: number; sales: number };

/** Comparativo mensal dos últimos N meses. */
export async function monthlyEvolution(months = 6) {
  const rows = await db.execute(sql`
    SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month,
           to_char(date_trunc('month', completed_at), 'MM/YYYY') AS label,
           COALESCE(SUM(total), 0)::text AS receita,
           COUNT(*)::int AS vendas,
           COALESCE(SUM(profit), 0)::text AS lucro
      FROM sales
     WHERE status = 'COMPLETED'
       AND completed_at >= date_trunc('month', CURRENT_DATE) - ${sql.raw(`interval '${months - 1} months'`)}
     GROUP BY 1, 2
     ORDER BY 1
  `);
  return (rows.rows as Array<{ month: string; label: string; receita: string; vendas: number; lucro: string }>).map(
    (r) => ({
      month: r.month,
      label: r.label,
      revenue: Number(r.receita),
      sales: Number(r.vendas),
      profit: Number(r.lucro),
    }),
  );
}

export const dashboardPeriodWhere = (from: string, to: string): SQL =>
  sql`completed_at >= ${`${from}T00:00:00Z`}::timestamptz AND completed_at < ${`${addDaysKey(to, 1)}T00:00:00Z`}::timestamptz`;
