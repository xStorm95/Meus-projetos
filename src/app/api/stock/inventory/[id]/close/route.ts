import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { closeInventory } from "@/server/services/stock-ops";

const schema = z.object({ applyAdjustments: z.boolean().default(true) });

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "stock.adjust", body: schema },
  async ({ params, body, user }) => {
    const result = await closeInventory({
      countId: params.id,
      applyAdjustments: body.applyAdjustments,
      actor: { id: user.id, name: user.name },
    });
    return ok(result);
  },
);
