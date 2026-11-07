import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { closeSession } from "@/server/services/cash";

export const POST = apiHandler<{ countedBreakdown: Record<string, number>; notes?: string }, unknown, { id: string }>(
  {
    permission: "cash.close",
    body: z.object({
      countedBreakdown: z.record(z.string(), z.number().min(0)),
      notes: z.string().max(1000).optional(),
    }),
  },
  async ({ params, body, user }) => {
    const result = await closeSession({
      sessionId: params.id,
      countedBreakdown: body.countedBreakdown,
      notes: body.notes,
      userId: user.id,
      userName: user.name,
    });
    return ok({
      session: result.session,
      summary: result.summary,
      difference: result.difference,
      counted: result.counted,
    });
  },
);
