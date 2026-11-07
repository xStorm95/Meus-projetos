import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { receiveReceivable } from "@/server/services/finance";

const schema = z.object({
  amount: z.union([z.string(), z.number()]),
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "TRANSFER", "OTHER"]),
  bankAccountId: z.string().uuid().nullable().optional(),
  applyCharges: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "finance.pay", body: schema },
  async ({ params, body, user }) => {
    const updated = await receiveReceivable({
      receivableId: params.id,
      ...body,
      actor: { id: user.id, name: user.name },
    });
    return ok({ receivable: updated });
  },
);
