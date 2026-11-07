import { z } from "zod";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvDate, csvNumber, jsonResponse } from "@/server/lib/export";
import { customerReports } from "@/server/services/customers";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  kind: z.enum(["inactive-30", "inactive-60", "inactive-90", "top-customers", "birthdays"]),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const GET = apiHandler(
  { permission: ["reports.export", "customers.export"], query: querySchema },
  async ({ query }) => {
    const stamp = new Date().toISOString().slice(0, 10);

    if (query.kind === "top-customers") {
      const data = await customerReports({ type: "top" });
      const rows = data.items as Array<Record<string, string | number>>;
      if (query.format === "json") return jsonResponse(`top-clientes_${stamp}.json`, rows);
      return csvResponse(
        `top-clientes_${stamp}.csv`,
        ["Cliente", "Telefone", "Compras", "Total gasto", "Ticket médio", "Última compra"],
        rows.map((r) => [
          String(r.name),
          String(r.phone ?? ""),
          Number(r.compras ?? 0),
          csvNumber(String(r.total)),
          csvNumber(String(r.ticket_medio)),
          r.ultima_compra ? csvDate(String(r.ultima_compra).slice(0, 10)) : "",
        ]),
      );
    }

    if (query.kind === "birthdays") {
      const data = await customerReports({ type: "birthdays", month: query.month });
      const rows = data.items as Array<Record<string, string>>;
      if (query.format === "json") return jsonResponse(`aniversariantes_${stamp}.json`, rows);
      return csvResponse(
        `aniversariantes_${stamp}.csv`,
        ["Nome", "Aniversário", "Telefone", "WhatsApp", "Aceita WhatsApp"],
        rows.map((r) => [
          String(r.name),
          csvDate(String(r.birthDate)),
          String(r.phone ?? ""),
          String(r.whatsapp ?? ""),
          r.acceptsWhatsapp ? "Sim" : "Não",
        ]),
      );
    }

    const type = query.kind === "inactive-30" ? "inactive30" : query.kind === "inactive-60" ? "inactive60" : "inactive90";
    const data = await customerReports({ type });
    const rows = data.items as Array<Record<string, string | number>>;
    if (query.format === "json") return jsonResponse(`${query.kind}_${stamp}.json`, rows);
    return csvResponse(
      `${query.kind}_${stamp}.csv`,
      ["Cliente", "Telefone", "Última compra", "Dias sem comprar", "Compras", "Total gasto"],
      rows.map((r) => [
        String(r.name),
        String(r.phone ?? ""),
        r.ultima_compra ? csvDate(String(r.ultima_compra).slice(0, 10)) : "",
        Number(r.dias_sem_comprar ?? 0),
        Number(r.compras ?? 0),
        csvNumber(String(r.total_gasto)),
      ]),
    );
  },
);
