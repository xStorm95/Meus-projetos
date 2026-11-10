import { z } from "zod";
import { idOpcional } from "@/server/lib/product-schema";
import { apiHandler, ok } from "@/server/lib/api";
import { getQuote, updateQuote } from "@/server/services/quotes";

const itemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
});

const schema = z.object({
  customerId: idOpcional(),
  validUntil: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1).optional(),
  discountAmount: z.number().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["OPEN", "EXPIRED", "CANCELED"]).optional(),
});

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "quotes.view" },
  async ({ params }) => ok(await getQuote(params.id)),
);

export const PATCH = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "quotes.manage", body: schema },
  async ({ params, body, user }) => ok({ quote: await updateQuote(params.id, body, { id: user.id, name: user.name }) }),
);
