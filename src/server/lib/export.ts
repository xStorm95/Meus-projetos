/**
 * Geração de arquivos de exportação (CSV / JSON) no servidor.
 * CSV em UTF-8 com BOM e separador ";" — abre corretamente no Excel pt-BR.
 */
import { NextResponse } from "next/server";

export type CsvValue = string | number | boolean | null | undefined;

function escapeCsv(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  // Números decimais usam vírgula no padrão pt-BR do Excel
  const text = raw.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return /[";\n]/.test(text) ? `"${text}"` : text;
}

export function toCSV(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeCsv).join(";"), ...rows.map((row) => row.map(escapeCsv).join(";"))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Valor monetário/número já formatado com vírgula decimal (pt-BR). */
export function csvNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2).replace(".", ",");
}

export function csvDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10).split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function csvDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return fmt.replace(",", "");
}

export function fileResponse(filename: string, body: string, contentType: string) {
  const safeName = filename.replace(/[^\w.\-]+/g, "-");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "no-store",
    },
  });
}

export function csvResponse(filename: string, headers: string[], rows: CsvValue[][]) {
  return fileResponse(filename, toCSV(headers, rows), "text/csv; charset=utf-8");
}

export function jsonResponse(filename: string, data: unknown) {
  return fileResponse(filename, JSON.stringify(data, null, 2), "application/json; charset=utf-8");
}
