import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { registerLoss } from "@/server/services/stock-ops";

const schema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().positive(),
  type: z.enum(["LOSS", "DAMAGE"]).default("LOSS"),
  reason: z.string().trim().min(3, "Descreva o motivo da baixa.").max(300),
});

export const POST = apiHandler({ permission: "stock.adjust", body: schema }, async ({ body, user }) => {
  return ok(await registerLoss({ ...body, actor: { id: user.id, name: user.name } }));
});
