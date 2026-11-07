import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { dre } from "@/server/services/finance";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";

export const GET = apiHandler(
  {
    permission: "finance.reports",
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      period: z.string().optional(),
    }),
  },
  async ({ query }) => {
    const period = resolvePeriod(
      (query.period as PeriodPreset) ?? "thisMonth",
      query.from,
      query.to,
    );
    return ok(await dre({ from: period.from, to: period.to }));
  },
);
