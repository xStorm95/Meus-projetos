import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { createPayable, listPayables } from "@/server/services/finance";
import { idOpcional } from "@/server/lib/product-schema";

const schema = z.object({
  description: z.string().trim().min(2, "Informe a descrição.").max(200),
  amount: z.union([z.string(), z.number()]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida."),
  supplierId: idOpcional(),
  categoryId: idOpcional(),
  costCenterId: idOpcional(),
  bankAccountId: idOpcional(),
  documentNumber: z.string().max(60).nullable().optional(),
  installments: z.number().int().min(1).max(60).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const GET = apiHandler(
  {
    permission: "finance.view",
    query: z.object({
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      supplierId: z.string().uuid().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(200).optional(),
    }),
  },
  async ({ query }) => ok(await listPayables(query)),
);

export const POST = apiHandler({ permission: "finance.create", body: schema }, async ({ body, user }) => {
  const created = await createPayable({
    ...body,
    amount: String(body.amount),
    actor: { id: user.id, name: user.name },
  });
  return ok({ items: created }, { status: 201 });
});
