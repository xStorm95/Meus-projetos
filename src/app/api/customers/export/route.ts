/**
 * Exportação de clientes em CSV.
 *
 * O botão "Exportar" na lista de clientes chamava esta rota, que não existia
 * (404). Segue o mesmo padrão de `/api/products/export`: CSV UTF-8 com BOM e
 * separador ";" (abre certo no Excel pt-BR).
 *
 * Reutiliza `listCustomers` — a mesma função que alimenta a tela — para que o
 * arquivo traga exatamente os mesmos totais, dívidas e classificações.
 */
import { z } from "zod";
import { apiHandler } from "@/server/lib/api";
import { listCustomers } from "@/server/services/customers";
import { csvDate, csvNumber, csvResponse, jsonResponse } from "@/server/lib/export";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  search: z.string().optional(),
  classification: z.string().optional(),
});

export const GET = apiHandler(
  { permission: ["customers.export", "customers.view"], query: querySchema },
  async ({ query }) => {
    // 10000 é o teto prático: acima disso o arquivo deixa de ser útil na planilha.
    const data = await listCustomers({
      search: query.search,
      classification: query.classification,
      page: 1,
      pageSize: 10000,
    });

    const stamp = new Date().toISOString().slice(0, 10);

    if (query.format === "json") return jsonResponse(`clientes_${stamp}.json`, data.items);

    return csvResponse(
      `clientes_${stamp}.csv`,
      [
        "Nome", "Documento", "Telefone", "WhatsApp", "E-mail", "Cidade", "UF",
        "Compras", "Total gasto", "Dívida", "Em atraso", "Crédito na loja",
        "Limite de crédito", "Última compra", "Classificações", "Cadastro",
      ],
      data.items.map((c) => [
        c.name,
        c.document,
        c.phone,
        c.whatsapp,
        c.email,
        c.city,
        c.state,
        String(c.purchases ?? 0),
        csvNumber(c.totalSpent),
        csvNumber(c.debt),
        csvNumber(c.overdueDebt),
        csvNumber(c.credits),
        csvNumber(c.creditLimit),
        csvDate(c.lastPurchase),
        (c.classifications ?? []).join(", "),
        csvDate(c.createdAt),
      ]),
    );
  },
);
