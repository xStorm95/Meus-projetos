/**
 * Pix para a tela de pagamento.
 *
 *  GET /api/pix                       → configuração + aviso (a tela mostra o
 *                                       atalho para Configurações se faltar)
 *  GET /api/pix?valor=189.90&venda=42 → BR Code com valor (QR + copia e cola)
 */
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { PIX_AVISO_CONFERENCIA, pixConfigurado, pixDaVenda } from "@/server/services/pix";

const querySchema = z.object({
  valor: z.coerce.number().positive().optional(),
  venda: z.string().max(40).optional(),
});

export const GET = apiHandler(
  { permission: ["sales.create", "sales.view"], query: querySchema },
  async ({ query }) => {
    const config = await pixConfigurado();

    if (query.valor === undefined) {
      return ok({
        ...config,
        aviso: PIX_AVISO_CONFERENCIA,
        dica: config.configurado ? null : "Cadastre a chave Pix em Configurações → Pagamentos.",
      });
    }

    if (!config.configurado) {
      return ok({
        ...config,
        payload: null,
        motivo: "Cadastre a chave Pix e a cidade em Configurações → Pagamentos para gerar o QR.",
        aviso: PIX_AVISO_CONFERENCIA,
      });
    }

    const pix = await pixDaVenda({ valor: query.valor, vendaNumero: query.venda ?? null });
    return ok({
      ...config,
      payload: pix.configurado ? pix.payload : null,
      valor: pix.valor,
      txid: pix.txid,
      aviso: PIX_AVISO_CONFERENCIA,
    });
  },
);
