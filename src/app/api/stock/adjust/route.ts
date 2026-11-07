import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { setStockQuantity } from "@/server/services/stock-ops";

const schema = z.object({
  variantId: z.string().uuid(),
  newQuantity: z.number().min(0, "O saldo não pode ser negativo."),
  reason: z.string().trim().min(3, "Informe o motivo do ajuste.").max(300),
});

export const POST = apiHandler({ permission: "stock.adjust", body: schema }, async ({ body, user }) => {
  const result = await setStockQuantity({
    ...body,
    actor: { id: user.id, name: user.name },
  });
  return ok(result);
});
