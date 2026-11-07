import { apiHandler, ok } from "@/server/lib/api";
import { creditDashboard, financialForecast, overdueSummary } from "@/server/services/finance";
import { cashBalanceToday } from "@/server/services/cash";

export const GET = apiHandler({ permission: "finance.view" }, async () => {
  const [credit, forecast, overdue, cashBalance] = await Promise.all([
    creditDashboard(),
    financialForecast({ days: 30 }),
    overdueSummary(),
    cashBalanceToday(),
  ]);
  return ok({ credit, forecast, overdue, cashBalance });
});
