import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { saveInventoryItems } from "@/server/services/stock-ops";

const schema = z.object({
  items: z
    .array(z.object({ variantId: z.string().uuid(), countedQty: z.number().min(0).nullable() }))
    .min(1),
});

export const PATCH = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "stock.adjust", body: schema },
  async ({ params, body }) => ok(await saveInventoryItems(params.id, body.items)),
);
