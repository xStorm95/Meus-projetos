"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Printer, Download, Info } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/primitives";
import { Field, Input, Select, Segmented } from "@/components/ui/form";
import { PERIOD_PRESETS } from "@/lib/constants";

type DreData = {
  period: { from: string; to: string };
  grossRevenue: string;
  deductions: string;
  netRevenue: string;
  cogs: string;
  grossProfit: string;
  grossMargin: number;
  operatingExpenses: string;
  operatingResult: string;
  otherIncome: string;
  otherExpenses: string;
  finalResult: string;
  netMargin: number;
  salesCount: number;
  discounts: string;
};

type DetailRow = { group: string; label: string; total: string };

export function DreView({
  data,
  period,
  details,
  company,
}: {
  data: DreData;
  period: { preset: string; label: string; from: string; to: string };
  details: DetailRow[];
  company: { name: string; document: string | null };
}) {
  const router = useRouter();
  const [preset, setPreset] = React.useState(period.preset);
  const [from, setFrom] = React.useState(period.from);
  const [to, setTo] = React.useState(period.to);
  const [view, setView] = React.useState<"RESUMO" | "ANALITICO">("RESUMO");

  function apply(nextPreset: string, nextFrom = from, nextTo = to) {
    const qs = new URLSearchParams({ period: nextPreset });
    if (nextPreset === "custom") {
      qs.set("from", nextFrom);
      qs.set("to", nextTo);
    }
    router.push(`/financeiro/dre?${qs.toString()}`);
  }

  const lines: Array<{
    label: string;
    value: string;
    kind: "total" | "sub" | "result" | "detail" | "spacer";
    hint?: string;
  }> = [
    { label: "Receita bruta de vendas", value: data.grossRevenue, kind: "total", hint: `${data.salesCount} venda(s) concluída(s)` },
    { label: "(-) Devoluções e cancelamentos", value: `-${data.deductions}`, kind: "detail" },
    { label: "Receita líquida", value: data.netRevenue, kind: "sub" },
    { label: "(-) CMV (custo das mercadorias vendidas)", value: `-${data.cogs}`, kind: "detail" },
    { label: "Lucro bruto", value: data.grossProfit, kind: "sub", hint: `Margem bruta ${data.grossMargin.toFixed(1)}%` },
    { label: "(-) Despesas operacionais", value: `-${data.operatingExpenses}`, kind: "detail" },
    { label: "Resultado operacional", value: data.operatingResult, kind: "sub" },
    { label: "(+) Outras receitas", value: data.otherIncome, kind: "detail" },
    { label: "(-) Outras despesas", value: `-${data.otherExpenses}`, kind: "detail" },
    { label: "Resultado líquido do período", value: data.finalResult, kind: "result", hint: `Margem líquida ${data.netMargin.toFixed(1)}%` },
  ];

  const positive = Number(data.finalResult) >= 0;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            DRE gerencial
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Demonstração do resultado · {period.label} · {period.from.split("-").reverse().join("/")} a{" "}
            {period.to.split("-").reverse().join("/")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() =>
              void downloadFile("/api/reports/finance/export", {
                kind: "dre",
                format: "csv",
                from: period.from,
                to: period.to,
              }).catch((e) => toast.error(errorMessage(e)))
            }
          >
            CSV
          </Button>
        </div>
      </div>

      <Card className="no-print p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Período" className="w-44">
            <Select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                if (e.target.value !== "custom") apply(e.target.value);
              }}
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {preset === "custom" && (
            <>
              <Field label="De" className="w-36">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Até" className="w-36">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <Button size="sm" onClick={() => apply("custom")}>
                Aplicar
              </Button>
            </>
          )}
          <div className="ml-auto">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "RESUMO", label: "Resumo" },
                { value: "ANALITICO", label: "Analítico" },
              ]}
            />
          </div>
        </div>
      </Card>

      <div className="print-area space-y-4">
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between border-b border-[var(--border-default)] pb-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold">{company.name}</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {company.document ? `CNPJ ${company.document}` : "Documento não configurado"} · DRE gerencial
              </p>
            </div>
            <div className="text-right text-[11px] text-[var(--text-muted)]">
              <p>Emitido em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
              <p>{period.label}</p>
            </div>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {lines.map((line) => (
              <div
                key={line.label}
                className={cn(
                  "flex items-baseline justify-between gap-4 py-2",
                  line.kind === "result" && "mt-1 rounded-lg bg-[var(--bg-muted)] px-3 py-3",
                  line.kind === "total" && "font-semibold",
                )}
              >
                <div className="min-w-0">
                  <span
                    className={cn(
                      "text-[13px]",
                      line.kind === "detail" && "text-[var(--text-secondary)]",
                      line.kind === "sub" && "font-medium",
                      line.kind === "result" && "font-semibold",
                    )}
                  >
                    {line.label}
                  </span>
                  {line.hint && <p className="text-[10px] text-[var(--text-muted)]">{line.hint}</p>}
                </div>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    line.kind === "result" ? "text-lg font-bold" : "text-[13px]",
                    line.kind === "result" && (positive ? "text-[var(--success)]" : "text-[var(--danger)]"),
                  )}
                >
                  {brl(line.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 border-t border-[var(--border-default)] pt-3 sm:grid-cols-4">
            {[
              { label: "Margem bruta", value: `${data.grossMargin.toFixed(1)}%` },
              { label: "Margem líquida", value: `${data.netMargin.toFixed(1)}%` },
              { label: "Ticket médio", value: brl(data.salesCount ? Number(data.netRevenue) / data.salesCount : 0) },
              { label: "Descontos concedidos", value: brl(data.discounts) },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{kpi.label}</p>
                <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>
        </Card>

        {view === "ANALITICO" && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold">Composição das despesas pagas no período</h2>
            {details.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Nenhuma despesa paga no período. Registre contas a pagar com categoria para alimentar esta análise.
              </p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="py-1.5">Grupo DRE</th>
                    <th className="py-1.5">Categoria</th>
                    <th className="py-1.5 text-right">Total pago</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((row, i) => (
                    <tr key={`${row.group}-${row.label}-${i}`} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-1.5">
                        <Badge tone={row.group === "OPERATING_EXPENSE" ? "warning" : row.group === "OTHER_INCOME" ? "success" : "info"}>
                          {GROUP_LABELS[row.group] ?? row.group}
                        </Badge>
                      </td>
                      <td className="py-1.5">{row.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{brl(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[10px] text-[var(--text-muted)]">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              A DRE é gerencial: considera vendas concluídas, devoluções registradas e despesas efetivamente pagas
              (regime de caixa). Documentos fiscais emitidos não alteram estes totais.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

const GROUP_LABELS: Record<string, string> = {
  REVENUE: "Receita",
  DEDUCTION: "Dedução",
  COGS: "CMV",
  OPERATING_EXPENSE: "Despesa operacional",
  OTHER_INCOME: "Outra receita",
  OTHER_EXPENSE: "Outra despesa",
};
