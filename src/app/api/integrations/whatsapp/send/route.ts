/**
 * Envio de mensagem por WhatsApp a partir da ficha do cliente.
 *
 * A tela chamava esta rota, que não existia (404) — o botão "WhatsApp" não
 * fazia nada.
 *
 * Como funciona (sem fingir integração):
 *  - Se a loja NÃO tem WhatsApp Business API configurada (`whatsappEnabled`),
 *    devolvemos `sent: false` com um link `wa.me` pronto. A tela já trata isso:
 *    abre o WhatsApp Web/app com a mensagem escrita. Nada é enviado pelo servidor.
 *  - Se estiver habilitada, o envio real depende de um provedor externo
 *    (token da Meta). Sem token configurado NÃO inventamos sucesso: devolvemos
 *    `sent: false` e o mesmo link, para a pessoa enviar manualmente.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { customers, settings } from "@/server/db/schema";
import { BusinessRuleError, NotFoundError } from "@/server/lib/errors";

const schema = z.object({
  customerId: z.string().uuid("Cliente inválido."),
  message: z.string().trim().min(1, "Escreva a mensagem.").max(2000),
});

/** Só dígitos, com DDI 55 quando o número parece brasileiro sem DDI. */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export const POST = apiHandler({ permission: "customers.view", body: schema }, async ({ body }) => {
  const rows = await db.select().from(customers).where(eq(customers.id, body.customerId)).limit(1);
  const customer = rows[0];
  if (!customer) throw new NotFoundError("Cliente");

  const phone = normalizePhone(customer.whatsapp ?? customer.phone);
  if (!phone) {
    throw new BusinessRuleError(
      "Este cliente não tem WhatsApp/telefone válido cadastrado. Cadastre o número na ficha dele.",
    );
  }

  const cfg = (await db.select().from(settings).limit(1))[0];
  const link = `https://wa.me/${phone}?text=${encodeURIComponent(body.message)}`;

  // Sem provedor configurado: abre o WhatsApp com a mensagem pronta.
  if (!cfg?.whatsappEnabled) {
    return ok({
      sent: false,
      message: `Abrindo o WhatsApp de ${customer.name} com a mensagem pronta (ligue o WhatsApp Business em Configurações para enviar automático).`,
      link,
    });
  }

  return ok({
    sent: false,
    message:
      "WhatsApp Business está marcado como ativo, mas o token do provedor (Meta) não está configurado. Abrindo o WhatsApp com a mensagem pronta.",
    link,
  });
});
