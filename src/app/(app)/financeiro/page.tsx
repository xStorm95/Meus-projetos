import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";
import { creditDashboard, financialForecast, overdueSummary, cashFlow } from "@/server/services/finance";
import { cashBalanceToday } from "@/server/services/cash";
import { listBankAccounts } from "@/server/services/finance";
import { FinanceOverview } from "./finance-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("finance.view")) redirect("/");

  const params = await searchParams;
  const preset = (params.period as PeriodPreset) || "thisMonth";
  const period = resolvePeriod(preset, params.from, params.to);

  const [flow, forecast, overdue, cashBalance, credit, accounts] = await Promise.all([
    cashFlow({ from: period.from, to: period.to }),
    financialForecast({ days: 30 }),
    overdueSummary(),
    cashBalanceToday(),
    creditDashboard(),
    listBankAccounts(),
  ]);

  return (
    <FinanceOverview
      data={JSON.parse(JSON.stringify({
        period,
        flow,
        forecast,
        overdue,
        cashBalance,
        credit,
        accounts,
      }))}
      period={{ preset, label: period.label }}
      permissions={{
        canCreate: user.permissions.includes("finance.create"),
        canTransfer: user.permissions.includes("finance.pay"),
        canTransferAccounts: user.permissions.includes("finance.pay"),
      }}
    />
  );
}
