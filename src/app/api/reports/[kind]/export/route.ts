import { z } from "zod";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvDate, csvNumber, jsonResponse, xlsxResponse } from "@/server/lib/export";
import { ForbiddenError } from "@/server/lib/errors";
import { REPORT_CATALOG, runReport } from "@/server/services/reports";

/**
 * Exportação de qualquer relatório do catálogo.
 * Formato suportado no servidor: CSV (Excel-friendly, ; e BOM) e JSON.
 * A impressão/PDF é feita no cliente a partir da mesma consulta.
 */
const querySchema = z.object({
  format: z.enum(["csv", "json", "xlsx"]).default("csv"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(20000).optional(),
});

export const GET = apiHandler<unknown, z.infer<typeof querySchema>, { kind: string }>(
  { query: querySchema },
  async ({ params, query, user }) => {
    const catalog = REPORT_CATALOG.find((r) => r.kind === params.kind);
    if (!catalog) throw new ForbiddenError("Relatório não disponível.");
    if (!user.permissions.includes(catalog.permission) && !user.permissions.includes("reports.view")) {
      throw new ForbiddenError("Você não tem permissão para exportar este relatório.");
    }

    const report = await runReport({
      kind: catalog.kind,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 5000,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    if (query.format === "json") return jsonResponse(`${catalog.kind}_${stamp}.json`, report);

    const rows = report.rows.map((row) =>
      report.columns.map((column) => {
        const value = row[column.key];
        if (value === null || value === undefined) return "";
        if (column.format === "money") return csvNumber(String(value));
        if (column.format === "number") return csvNumber(String(value));
        if (column.format === "date") return csvDate(String(value));
        return String(value);
      }),
    );

    // Excel: dinheiro/número vai como número (soma e filtro funcionam);
    // data segue como texto DD/MM/AAAA para não depender da região do Excel.
    if (query.format === "xlsx") {
      const linhasXlsx = report.rows.map((row) =>
        report.columns.map((column) => {
          const value = row[column.key];
          if (value === null || value === undefined || value === "") return "";
          if (column.format === "money" || column.format === "number") {
            const n = Number(value);
            return Number.isFinite(n) ? n : String(value);
          }
          if (column.format === "date") return csvDate(String(value));
          return String(value);
        }),
      );
      return xlsxResponse(
        `${catalog.kind}_${stamp}.xlsx`,
        report.columns.map((c) => c.label),
        linhasXlsx,
        { sheetName: report.title ?? catalog.kind },
      );
    }

    return csvResponse(
      `${catalog.kind}_${stamp}.csv`,
      report.columns.map((c) => c.label),
      rows,
    );
  },
);
