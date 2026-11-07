import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { cancelPayable } from "@/server/services/finance";

export const POST = apiHandler<{ reason: string }, unknown, { id: string }>(
  {
    permission: "finance.delete",
    body: z.object({ reason: z.string().trim().min(3, "Informe o motivo.").max(500) }),
  },
  async ({ params, body, user }) => {
    const updated = await cancelPayable(params.id, body.reason, { id: user.id, name: user.name });
    return ok({ payable: updated });
  },
);
