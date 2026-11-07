import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getSettingsCached } from "@/server/services/settings";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";
import { getDashboard, monthlyEvolution } from "@/server/services/dashboard";
import { DashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("sales.view") && !user.permissions.includes("reports.view")) {
    redirect("/pdv");
  }

  const params = await searchParams;
  const preset = (params.period as PeriodPreset) || "thisMonth";
  const period = resolvePeriod(preset, params.from, params.to);

  const [data, evolution, settings] = await Promise.all([
    getDashboard({ from: period.from, to: period.to }),
    monthlyEvolution(6),
    getSettingsCached(),
  ]);

  return (
    <DashboardView
      data={data}
      evolution={evolution}
      preset={preset}
      periodLabel={period.label}
      userName={user.name.split(" ")[0]}
      canSeeFinance={user.permissions.includes("finance.view")}
      companyName={settings.companyName}
      monthlyGoal={user.monthlyGoal}
    />
  );
}
