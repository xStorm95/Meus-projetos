import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { listMovements } from "@/server/services/stock-ops";

export const GET = apiHandler(
  {
    permission: "stock.view",
    query: z.object({
      variantId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      type: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(200).optional(),
    }),
  },
  async ({ query }) => ok(await listMovements(query)),
);
