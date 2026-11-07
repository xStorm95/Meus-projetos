import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { listInventories, startInventory } from "@/server/services/stock-ops";
import { getInventory } from "@/server/services/stock-ops";

export const GET = apiHandler(
  { permission: "stock.view", query: z.object({ id: z.string().uuid().optional() }) },
  async ({ query }) => {
    if (query.id) return ok(await getInventory(query.id));
    return ok({ items: await listInventories() });
  },
);

const startSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  notes: z.string().max(300).optional(),
});

export const POST = apiHandler({ permission: "stock.adjust", body: startSchema }, async ({ body, user }) => {
  const count = await startInventory({ ...body, actor: { id: user.id, name: user.name } });
  return ok({ count }, { status: 201 });
});
