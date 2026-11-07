import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { listReceivables, refreshOverdueReceivables } from "@/server/services/finance";

export const GET = apiHandler(
  {
    permission: ["finance.view", "credit.view"],
    query: z.object({
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      customerId: z.string().uuid().optional(),
      overdueOnly: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(200).optional(),
    }),
  },
  async ({ query }) => {
    await refreshOverdueReceivables();
    const data = await listReceivables({
      ...query,
      overdueOnly: query.overdueOnly === "true",
    });
    return ok(data);
  },
);
