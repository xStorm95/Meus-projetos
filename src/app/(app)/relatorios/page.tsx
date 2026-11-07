import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";
import { REPORT_CATALOG, runReport, type ReportKind } from "@/server/services/reports";
import { ReportsView } from "@/components/reports/reports-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; period?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("reports.view") && !user.permissions.includes("sales.view")) redirect("/");

  const params = await searchParams;
  const preset = (params.period as PeriodPreset) || "last30";
  const period = resolvePeriod(preset, params.from, params.to);

  const catalog = REPORT_CATALOG.filter(
    (item) =>
      user.permissions.includes(item.permission) ||
      user.permissions.includes("reports.view") ||
      user.role === "ADMIN",
  );

  const requested = params.kind as ReportKind | undefined;
  const kind: ReportKind =
    requested && catalog.some((c) => c.kind === requested) ? requested : (catalog[0]?.kind ?? "sales-summary");

  const report = await runReport({ kind, from: period.from, to: period.to, limit: 500 });

  return (
    <ReportsView
      initialReport={report}
      catalog={catalog.map((c) => ({
        kind: c.kind,
        title: c.title,
        description: c.description,
        group: c.group,
        needsPeriod: c.needsPeriod,
      }))}
      initialPeriod={{ from: period.from, to: period.to, preset }}
    />
  );
}
