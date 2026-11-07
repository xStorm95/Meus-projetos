import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { registerEntry } from "@/server/services/stock-ops";

const schema = z.object({
  type: z.enum(["PURCHASE", "RETURN", "OPENING"]).default("PURCHASE"),
  reason: z.string().trim().min(3, "Informe a observação da entrada.").max(300),
  referenceType: z.string().max(30).optional(),
  referenceId: z.string().max(60).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().positive("A quantidade deve ser maior que zero."),
        unitCost: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .min(1, "Adicione ao menos um item."),
});

export const POST = apiHandler({ permission: "stock.adjust", body: schema }, async ({ body, user }) => {
  const result = await registerEntry({ ...body, actor: { id: user.id, name: user.name } });
  return ok(result);
});
