"use client";

import * as React from "react";
import {
  BarChart3, Download, Printer, Table2, TrendingUp, Users, Wallet, Package,
  FileText, Search, Calendar, Percent, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/form";
import { PERIOD_PRESETS } from "@/lib/constants";

type ReportColumn = { key: string; label: string; align?: "left" | "right" | "center"; format?: string };
type ReportResult = {
  kind: string;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  summary: Array<{ label: string; value: string }>;
  period?: { from: string; to: string };
  generatedAt: string;
  totalRows: number;
};

type CatalogItem = {
  kind: string;
  title: string;
  description: string;
  group: string;
  needsPeriod: boolean;
};

const GROUP_LABELS: Record<string, string> = {
  VENDAS: "Vendas",
  ESTOQUE: "Estoque",
  CLIENTES: "Clientes e CRM",
  FINANCEIRO: "Financeiro",
  OPERACIONAL: "Operacional",
};

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  VENDAS: TrendingUp,
  ESTOQUE: Package,
  CLIENTES: Users,
  FINANCEIRO: Wallet,
  OPERACIONAL: FileText,
};

function formatCell(value: string | number | null, format?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") return brl(value);
  if (format === "number") return num(value);
  if (format === "date") {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return dateBR(text.slice(0, 10));
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }
  return String(value);
}

export function ReportsView({
  initialReport,
  catalog,
  initialPeriod,
}: {
  initialReport: ReportResult;
  catalog: CatalogItem[];
  initialPeriod: { from: string; to: string; preset: string };
}) {
  const [selected, setSelected] = React.useState(initialReport.kind);
  const [report, setReport] = React.useState<ReportResult>(initialReport);
  const [loading, setLoading] = React.useState(false);
  const [group, setGroup] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");
  const [preset, setPreset] = React.useState(initialPeriod.preset);
  const [from, setFrom] = React.useState(initialPeriod.from);
  const [to, setTo] = React.useState(initialPeriod.to);

  const needsPeriod = catalog.find((c) => c.kind === selected)?.needsPeriod ?? true;

  async function loadReport(kind: string, period = { from, to }) {
    setLoading(true);
    setSelected(kind);
    try {
      const data = await api.get<ReportResult>("/api/reports/run", {
        kind,
        from: period.from,
        to: period.to,
        limit: 500,
      });
      setReport(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(value: string) {
    setPreset(value);
    if (value === "custom") return;
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let nextFrom = from;
    let nextTo = iso(today);
    switch (value) {
      case "today":
        nextFrom = iso(today);
        break;
      case "yesterday": {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        nextFrom = iso(y);
        nextTo = iso(y);
        break;
      }
      case "last7": {
        const d = new Date(today);
        d.setDate(d.getDate() - 6);
        nextFrom = iso(d);
        break;
      }
      case "last30": {
        const d = new Date(today);
        d.setDate(d.getDate() - 29);
        nextFrom = iso(d);
        break;
      }
      case "thisMonth":
        nextFrom = `${iso(today).slice(0, 7)}-01`;
        break;
      case "lastMonth": {
        const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        nextFrom = iso(d);
        const last = new Date(today.getFullYear(), today.getMonth(), 0);
        nextTo = iso(last);
        break;
      }
      case "thisYear":
        nextFrom = `${iso(today).slice(0, 4)}-01-01`;
        break;
    }
    setFrom(nextFrom);
    setTo(nextTo);
    void loadReport(selected, { from: nextFrom, to: nextTo });
  }

  const filteredCatalog = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (group !== "ALL" && c.group !== group) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  }, [catalog, group, search]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of filteredCatalog) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [filteredCatalog]);

  async function exportFile(format: "csv" | "json") {
    try {
      await downloadFile(`/api/reports/${report.kind}/export`, {
        format,
        from: report.period?.from ?? from,
        to: report.period?.to ?? to,
      });
      toast.success(`Arquivo ${format.toUpperCase()} gerado.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const chartRows = React.useMemo(() => {
    // escolhe duas primeiras colunas numéricas para um gráfico simples de barras
    const numeric = report.columns.filter((c) => c.format === "money" || c.format === "number");
    if (!numeric.length || !report.rows.length) return null;
    const labelCol = report.columns.find((c) => c.format === "text" || c.format === "date") ?? report.columns[0];
    const valueCol = numeric[0];
    const rows = report.rows
      .slice(0, 14)
      .map((r) => ({ label: String(r[labelCol.key] ?? "—"), value: Number(r[valueCol.key] ?? 0) }));
    const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
    return { rows, max, label: valueCol.label };
  }, [report]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {catalog.length} relatórios gerenciais · dados calculados no servidor a partir do banco
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* -------------------- seletor -------------------- */}
        <div className="space-y-3">
          <Card className="p-3">
            <Field label="Buscar relatório">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ex.: estoque, vendas..."
                  className="pl-8"
                />
              </div>
            </Field>
            <div className="mt-2 flex flex-wrap gap-1">
              {["ALL", "VENDAS", "ESTOQUE", "CLIENTES", "FINANCEIRO", "OPERACIONAL"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    group === g ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--bg-muted)] text-[var(--text-muted)]",
                  )}
                >
                  {g === "ALL" ? "Todos" : GROUP_LABELS[g]}
                </button>
              ))}
            </div>
          </Card>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {grouped.map(([groupName, items]) => {
              const Icon = GROUP_ICONS[groupName] ?? BarChart3;
              return (
                <div key={groupName}>
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    <Icon className="h-3 w-3" /> {GROUP_LABELS[groupName] ?? groupName}
                  </p>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <button
                        key={item.kind}
                        onClick={() => void loadReport(item.kind)}
                        className={cn(
                          "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                          selected === item.kind
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-transparent bg-[var(--bg-surface)] hover:border-[var(--border-default)]",
                        )}
                      >
                        <p className="text-[12px] font-semibold">{item.title}</p>
                        <p className="text-[10px] leading-tight text-[var(--text-muted)]">{item.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {grouped.length === 0 && <p className="text-xs text-[var(--text-muted)]">Nenhum relatório encontrado.</p>}
          </div>
        </div>

        {/* -------------------- resultado -------------------- */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Período" className="w-40">
                <Select value={preset} onChange={(e) => applyPreset(e.target.value)} disabled={!needsPeriod}>
                  {PERIOD_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="De" className="w-36">
                <Input
                  type="date"
                  value={from}
                  disabled={!needsPeriod}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreset("custom");
                  }}
                />
              </Field>
              <Field label="Até" className="w-36">
                <Input
                  type="date"
                  value={to}
                  disabled={!needsPeriod}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreset("custom");
                  }}
                />
              </Field>
              <Button size="sm" onClick={() => void loadReport(selected)} loading={loading} leftIcon={<Calendar className="h-3.5 w-3.5" />}>
                Aplicar
              </Button>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                  Imprimir
                </Button>
                <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => void exportFile("csv")}>
                  CSV
                </Button>
                <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => void exportFile("json")}>
                  JSON
                </Button>
              </div>
            </div>
          </Card>

          <div className="print-area space-y-3">
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{report.title}</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {report.description}
                    {report.period && ` · ${dateBR(report.period.from)} a ${dateBR(report.period.to)}`}
                  </p>
                </div>
                <div className="text-right text-[10px] text-[var(--text-muted)]">
                  <p>{num(report.totalRows)} linha(s)</p>
                  <p>Gerado em {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                </div>
              </div>

              {report.summary.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.summary.map((s) => (
                    <div key={s.label} className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-1.5">
                      <p className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{s.label}</p>
                      <p className="text-[13px] font-bold tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {chartRows && (
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  <BarChart3 className="h-3.5 w-3.5" /> {chartRows.label} (top {chartRows.rows.length})
                </p>
                <div className="space-y-1">
                  {chartRows.rows.map((row, i) => (
                    <div key={`${row.label}-${i}`} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 truncate text-[10px] text-[var(--text-muted)]">{row.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-[var(--bg-muted)]">
                        <div
                          className="h-full rounded bg-[var(--accent)]"
                          style={{ width: `${Math.max(2, (Math.abs(row.value) / chartRows.max) * 100)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-[10px] font-semibold tabular-nums">
                        {num(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                </div>
              ) : report.rows.length === 0 ? (
                <EmptyState
                  icon={<Table2 className="h-6 w-6" />}
                  title="Sem dados no período"
                  description="Ajuste o período ou os filtros e gere novamente."
                />
              ) : (
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[var(--bg-muted)] text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                      <tr>
                        {report.columns.map((col) => (
                          <th
                            key={col.key}
                            className={cn(
                              "whitespace-nowrap px-2.5 py-2",
                              col.align === "right" ? "text-right" : "text-left",
                            )}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, i) => (
                        <tr key={i} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-muted)]/50">
                          {report.columns.map((col) => (
                            <td
                              key={col.key}
                              className={cn(
                                "whitespace-nowrap px-2.5 py-1.5",
                                col.align === "right" ? "text-right tabular-nums" : "text-left",
                                col.format === "money" && "font-medium",
                              )}
                            >
                              {formatCell(row[col.key], col.format)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
