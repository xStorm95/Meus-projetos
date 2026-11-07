import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { renegotiate } from "@/server/services/finance";

const schema = z.object({
  customerId: z.string().uuid("Cliente inválido."),
  receivableIds: z.array(z.string().uuid()).min(1, "Selecione as parcelas."),
  installments: z.number().int().min(1).max(48),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  notes: z.string().max(500).optional(),
});

export const POST = apiHandler({ permission: "credit.renegotiate", body: schema }, async ({ body, user }) => {
  const renegotiation = await renegotiate({
    ...body,
    actor: { id: user.id, name: user.name },
  });
  return ok({ renegotiation }, { status: 201 });
});

