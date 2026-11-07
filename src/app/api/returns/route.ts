import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { createReturn, listReturns } from "@/server/services/returns";

const schema = z.object({
  saleId: z.string().uuid("Venda inválida."),
  type: z.enum(["EXCHANGE", "RETURN"]),
  reason: z.string().trim().min(3, "Informe o motivo da troca/devolução.").max(300),
  refundMethod: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "EXCHANGE", "NONE"]),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.number().positive("Quantidade inválida."),
        action: z.enum(["RESTOCK", "DAMAGED", "DISCARD"]),
      }),
    )
    .min(1, "Selecione ao menos um item."),
  exchangeItems: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().positive() }))
    .optional(),
});

export const GET = apiHandler(
  {
    permission: "returns.view",
    query: z.object({
      type: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  async ({ query }) => ok(await listReturns(query)),
);

export const POST = apiHandler({ permission: "returns.create", body: schema }, async ({ body, user }) => {
  const result = await createReturn(body, { id: user.id, name: user.name });
  return ok(
    {
      returnRecord: result.returnRecord,
      difference: result.difference,
    },
    { status: 201 },
  );
});
