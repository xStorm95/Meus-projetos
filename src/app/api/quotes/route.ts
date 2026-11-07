import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { createQuote, listQuotes, refreshExpiredQuotes } from "@/server/services/quotes";

const itemSchema = z.object({
  variantId: z.string().uuid("Produto inválido."),
  quantity: z.number().positive("Quantidade deve ser maior que zero."),
  unitPrice: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
});

const quoteSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1, "Adicione ao menos um produto."),
  discountAmount: z.number().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const GET = apiHandler(
  {
    permission: "quotes.view",
    query: z.object({
      status: z.string().optional(),
      customerId: z.string().uuid().optional(),
      search: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  async ({ query }) => {
    await refreshExpiredQuotes();
    return ok(await listQuotes(query));
  },
);

export const POST = apiHandler({ permission: "quotes.manage", body: quoteSchema }, async ({ body, user }) => {
  const quote = await createQuote(body, { id: user.id, name: user.name });
  return ok({ quote }, { status: 201 });
});
