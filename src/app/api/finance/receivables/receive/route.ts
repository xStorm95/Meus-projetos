/**
 * Recebimento de parcela a partir da ficha do cliente.
 *
 * A ficha do cliente (`/clientes/[id]`) enviava para esta rota, que não existia
 * (404) — o botão "Receber" simplesmente não funcionava.
 *
 * A rota por id (`/api/finance/receivables/[id]/receive`) já existe e é boa;
 * esta apenas aceita o `receivableId` no corpo, para não precisar mudar a tela,
 * e delega para o MESMO serviço — sem duplicar regra de encargos/juros.
 */
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { receiveReceivable } from "@/server/services/finance";

const schema = z.object({
  receivableId: z.string().uuid("Parcela inválida."),
  amount: z.union([z.string(), z.number()]),
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "TRANSFER", "OTHER"]),
  bankAccountId: z.string().uuid().nullable().optional(),
  applyCharges: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const POST = apiHandler({ permission: "finance.pay", body: schema }, async ({ body, user }) => {
  const { receivableId, ...rest } = body;
  const updated = await receiveReceivable({
    receivableId,
    ...rest,
    actor: { id: user.id, name: user.name },
  });
  return ok({ receivable: updated });
});
