import { redirect } from "next/navigation";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";
import { db } from "@/server/db/client";
import { financeCategories, financeEntries, payables } from "@/server/db/schema";
import { dre } from "@/server/services/finance";
import { getSettingsCached } from "@/server/services/settings";
import { DreView } from "./dre-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "DRE" };

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("finance.reports") && !user.permissions.includes("finance.view")) redirect("/");

  const params = await searchParams;
  const preset = (params.period as PeriodPreset) || "thisMonth";
  const period = resolvePeriod(preset, params.from, params.to);

  const fromTs = new Date(`${period.from}T00:00:00Z`);
  const toTs = new Date(`${period.to}T23:59:59Z`);

  const [data, settings, details] = await Promise.all([
    dre({ from: period.from, to: period.to }),
    getSettingsCached(),
    db
      .select({
        group: sql<string>`COALESCE(${financeCategories.dreGroup}::text, 'SEM_CATEGORIA')`,
        label: sql<string>`COALESCE(${financeCategories.name}, 'Sem categoria')`,
        total: sql<string>`COALESCE(SUM(${financeEntries.amount}), 0)::text`,
      })
      .from(financeEntries)
      .leftJoin(payables, eq(payables.id, financeEntries.payableId))
      .leftJoin(financeCategories, eq(financeCategories.id, payables.categoryId))
      .where(
        and(
          eq(financeEntries.kind, "PAYMENT"),
          gte(financeEntries.paidAt, fromTs),
          lte(financeEntries.paidAt, toTs),
        ),
      )
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`3 DESC`),
  ]);

  return (
    <DreView
      data={data}
      period={{ ...period, preset }}
      details={details}
      company={{
        name: settings.companyName,
        document: settings.companyDocument ?? null,
      }}
    />
  );
}
