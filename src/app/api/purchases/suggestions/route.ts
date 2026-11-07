import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { purchaseSuggestions } from "@/server/services/purchases";

export const GET = apiHandler(
  {
    permission: "purchases.view",
    query: z.object({ supplierId: z.string().uuid().optional() }),
  },
  async ({ query }) => {
    const suggestions = await purchaseSuggestions();
    return ok({
      suggestions: query.supplierId
        ? suggestions.filter((s) => s.supplierId === query.supplierId)
        : suggestions,
    });
  },
);
