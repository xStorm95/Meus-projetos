import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { transferStock } from "@/server/services/stock-ops";

const schema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  notes: z.string().max(300).optional(),
  items: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1, "Adicione ao menos um item."),
});

export const POST = apiHandler({ permission: "stock.transfer", body: schema }, async ({ body, user }) => {
  const transfer = await transferStock({ ...body, actor: { id: user.id, name: user.name } });
  return ok({ transfer });
});
