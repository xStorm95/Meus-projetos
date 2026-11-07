import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { receivePurchaseOrder } from "@/server/services/purchases";

const schema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        receivedQty: z.number().min(0, "Quantidade inválida."),
        unitCost: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .min(1, "Informe ao menos um item recebido."),
  createPayables: z.boolean().optional(),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  installments: z.number().int().min(1).max(36).optional(),
});

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "purchases.manage", body: schema },
  async ({ params, body, user }) => {
    const result = await receivePurchaseOrder({
      orderId: params.id,
      ...body,
      actor: { id: user.id, name: user.name },
    });
    return ok(result);
  },
);
