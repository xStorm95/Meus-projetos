import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { searchVariants } from "@/server/services/products";

export const GET = apiHandler(
  {
    permission: ["sales.create", "products.view"],
    query: z.object({ q: z.string().trim().min(1), limit: z.coerce.number().int().max(60).optional() }),
  },
  async ({ query }) => {
    const items = await searchVariants({ q: query.q, limit: query.limit });
    return ok({ items });
  },
);
