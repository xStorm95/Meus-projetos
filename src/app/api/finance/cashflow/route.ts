import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { cashFlow, financialForecast, overdueSummary } from "@/server/services/finance";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";

export const GET = apiHandler(
  {
    permission: "finance.view",
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      period: z.string().optional(),
    }),
  },
  async ({ query }) => {
    const period = resolvePeriod((query.period as PeriodPreset) ?? "thisMonth", query.from, query.to);
    const [flow, forecast, overdue] = await Promise.all([
      cashFlow({ from: period.from, to: period.to }),
      financialForecast({ days: 30 }),
      overdueSummary(),
    ]);
    return ok({ period: { ...period }, flow, forecast, overdue });
  },
);
