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
import { csvDate, csvNumber, csvResponse, jsonResponse, xlsxResponse } from "@/server/lib/export";

const querySchema = z.object({
  format: z.enum(["csv", "json", "xlsx"]).default("csv"),
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
    const headers = [
      "Nome", "Documento", "Telefone", "WhatsApp", "E-mail", "Cidade", "UF",
      "Compras", "Total gasto", "Dívida", "Em atraso", "Crédito na loja",
      "Limite de crédito", "Última compra", "Classificações", "Cadastro",
    ];
    // Linha "crua": números como número (Excel) e datas já em DD/MM/AAAA.
    const linhas = data.items.map((c) => [
      c.name,
      c.document,
      c.phone,
      c.whatsapp,
      c.email,
      c.city,
      c.state,
      Number(c.purchases ?? 0),
      Number(c.totalSpent ?? 0),
      Number(c.debt ?? 0),
      Number(c.overdueDebt ?? 0),
      Number(c.credits ?? 0),
      Number(c.creditLimit ?? 0),
      csvDate(c.lastPurchase),
      (c.classifications ?? []).join(", "),
      csvDate(c.createdAt),
    ]);

    if (query.format === "json") return jsonResponse(`clientes_${stamp}.json`, data.items);

    // Excel: números vão como número (dá para somar/filtrar na planilha).
    if (query.format === "xlsx")
      return xlsxResponse(`clientes_${stamp}.xlsx`, headers, linhas, { sheetName: "Clientes" });

    // CSV: mesmas colunas, com dinheiro no padrão pt-BR (vírgula decimal).
    return csvResponse(
      `clientes_${stamp}.csv`,
      headers,
      data.items.map((c) => [
        c.name,
        c.document,
        c.phone,
        c.whatsapp,
        c.email,
        c.city,
        c.state,
        c.purchases,
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
