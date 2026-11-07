"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Landmark, PiggyBank,
  CreditCard, CalendarClock, ArrowLeftRight, Loader2,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";

type Overview = {
  period: { from: string; to: string; label: string };
  flow: {
    receipts: string;
    payments: string;
    salesTotal: string;
    salesCount: number;
    balance: string;
    daily: Array<{ day: string; entradas: string; saidas: string }>;
  };
  forecast: {
    days: number;
    until: string;
    toPay: { total: string; count: number };
    toReceive: { total: string; count: number };
    projectedBalance: string;
  };
  overdue: {
    payables: { total: string; count: number };
    receivables: { total: string; count: number };
  };
  cashBalance: string;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    bankName: string | null;
    currentBalance: string;
  }>;
  credit: {
    totals: {
      totalOpen: string;
      totalOverdue: string;
      totalUpcoming: string;
      paidCount: number;
      pendingCount: number;
      overdueCount: number;
    } | null;
  };
};

export function FinanceOverview({
  data,
  period,
  permissions,
}: {
  data: Overview;
  period: { preset: string; label: string };
  permissions: { canCreate: boolean; canTransfer: boolean; canTransferAccounts: boolean };
}) {
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [from, setFrom] = React.useState(data.accounts[0]?.id ?? "");
  const [to, setTo] = React.useState(data.accounts[1]?.id ?? "");
  const [amount, setAmount] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  const chartData = data.flow.daily.map((d) => ({
    label: dateBR(d.day).slice(0, 5),
    entradas: Number(d.entradas),
    saidas: Number(d.saidas),
  }));

  async function handleTransfer() {
    if (!from || !to) {
      toast.error("Selecione as contas de origem e destino.");
      return;
    }
    if (from === to) {
      toast.error("As contas devem ser diferentes.");
      return;
    }
    if (amount <= 0) {
      toast.error("Informe um valor.");
      return;
    }
    setSaving(true);
    try {
      await api.put("/api/finance/accounts", {
        fromAccountId: from,
        toAccountId: to,
        amount,
        date: new Date().toISOString().slice(0, 10),
      });
      toast.success("Transferência registrada.");
      setTransferOpen(false);
      setAmount(0);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const credit = data.credit.totals;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Financeiro
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Visão de {period.label} · {dateBR(data.period.from)} a {dateBR(data.period.to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/financeiro/contas-a-pagar">
            <Button variant="outline" size="sm" leftIcon={<TrendingDown className="h-3.5 w-3.5" />}>Contas a pagar</Button>
          </Link>
          <Link href="/financeiro/contas-a-receber">
            <Button variant="outline" size="sm" leftIcon={<TrendingUp className="h-3.5 w-3.5" />}>Contas a receber</Button>
          </Link>
          <Link href="/financeiro/dre">
            <Button variant="outline" size="sm" leftIcon={<Landmark className="h-3.5 w-3.5" />}>DRE</Button>
          </Link>
          {permissions.canTransfer && (
            <Button size="sm" onClick={() => setTransferOpen(true)} leftIcon={<ArrowLeftRight className="h-3.5 w-3.5" />}>
              Transferência
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Recebimentos no período" value={brl(data.flow.receipts)} hint={`${num(data.flow.salesCount)} vendas: ${brl(data.flow.salesTotal)}`} icon={<TrendingUp className="h-3.5 w-3.5" />} tone="success" />
        <Kpi label="Pagamentos no período" value={brl(data.flow.payments)} hint="Saídas efetivamente pagas" icon={<TrendingDown className="h-3.5 w-3.5" />} tone="danger" />
        <Kpi label="Resultado do período" value={brl(data.flow.balance)} hint="Recebimentos - pagamentos" icon={<Wallet className="h-3.5 w-3.5" />} tone="gold" />
        <Kpi label="Saldo em caixa" value={brl(data.cashBalance)} hint="Caixas abertos agora" icon={<PiggyBank className="h-3.5 w-3.5" />} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MiniAlert
          label="A receber vencido"
          value={brl(data.overdue.receivables.total)}
          count={`${data.overdue.receivables.count} parcelas`}
          tone="danger"
          href="/financeiro/contas-a-receber?overdue=true"
        />
        <MiniAlert
          label="A pagar vencido"
          value={brl(data.overdue.payables.total)}
          count={`${data.overdue.payables.count} contas`}
          tone="warning"
          href="/financeiro/contas-a-pagar?status=PENDING"
        />
        <MiniAlert
          label={`A receber (${data.forecast.days} dias)`}
          value={brl(data.forecast.toReceive.total)}
          count={`${data.forecast.toReceive.count} parcelas`}
          tone="info"
          href="/financeiro/contas-a-receber"
        />
        <MiniAlert
          label={`A pagar (${data.forecast.days} dias)`}
          value={brl(data.forecast.toPay.total)}
          count={`${data.forecast.toPay.count} contas`}
          tone="neutral"
          href="/financeiro/contas-a-pagar"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Fluxo de caixa diário</CardTitle>
              <CardDescription>Entradas e saídas de {dateBR(data.period.from)} a {dateBR(data.period.to)}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Sem movimentação no período" description="Não há recebimentos ou pagamentos registrados nesse intervalo." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, fontSize: 12 }}
                    formatter={((v: unknown) => brl(Number(v))) as never}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="entradas" name="Entradas" fill="#15803d" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="saidas" name="Saídas" fill="#b91c1c" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Previsão financeira</CardTitle>
                <CardDescription>Próximos {data.forecast.days} dias</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between rounded-lg bg-[var(--success-soft)] px-3 py-2">
                <span className="text-[var(--text-secondary)]">Previsto a receber</span>
                <strong className="text-[var(--success)]">{brl(data.forecast.toReceive.total)}</strong>
              </div>
              <div className="flex justify-between rounded-lg bg-[var(--danger-soft)] px-3 py-2">
                <span className="text-[var(--text-secondary)]">Previsto a pagar</span>
                <strong className="text-[var(--danger)]">{brl(data.forecast.toPay.total)}</strong>
              </div>
              <div className="flex justify-between border-t border-[var(--border-default)] pt-2">
                <span className="font-semibold">Saldo projetado</span>
                <strong className={cn(Number(data.forecast.projectedBalance) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                  {brl(data.forecast.projectedBalance)}
                </strong>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Vencimentos até {dateBR(data.forecast.until)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Crediário</CardTitle>
                <CardDescription>Situação do carnê da loja</CardDescription>
              </div>
              <Link href="/crediario" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
                Ver
              </Link>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {!credit ? (
                <p className="text-[var(--text-muted)]">Sem dados.</p>
              ) : (
                <>
                  <Row label="Total a receber" value={brl(credit.totalOpen)} />
                  <Row label="Vencido" value={brl(credit.totalOverdue)} tone="danger" />
                  <Row label="A vencer" value={brl(credit.totalUpcoming)} tone="success" />
                  <Row label="Parcelas pendentes" value={num(credit.pendingCount)} />
                  <Row label="Parcelas pagas" value={num(credit.paidCount)} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Contas e caixas</CardTitle>
            <CardDescription>Saldos das contas cadastradas</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.accounts.length === 0 ? (
            <EmptyState icon={<CreditCard className="h-6 w-6" />} title="Nenhuma conta cadastrada" description="Cadastre contas em Configurações para acompanhar saldos." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.accounts.map((acc) => (
                <div key={acc.id} className="rounded-xl border border-[var(--border-default)] p-3">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3 w-3 text-[var(--text-muted)]" />
                    <p className="truncate text-[11px] font-semibold">{acc.name}</p>
                  </div>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums">
                    {brl(acc.currentBalance)}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {acc.type === "CASH" ? "Caixa" : acc.type === "BANK" ? "Conta bancária" : "Cartão"}
                    {acc.bankName ? ` · ${acc.bankName}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transferência entre contas"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleTransfer()}>Transferir</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Conta de origem" required>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {brl(a.currentBalance)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Conta de destino" required>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {brl(a.currentBalance)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Valor" required>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Alert tone="info">
            A transferência atualiza o saldo das duas contas e fica registrada na auditoria.
          </Alert>
        </div>
      </Modal>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "gold" | "success" | "danger";
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[var(--text-muted)]",
            tone === "gold" && "text-[var(--accent)]",
            tone === "success" && "text-[var(--success)]",
            tone === "danger" && "text-[var(--danger)]",
          )}>
            {icon}
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        </div>
        <p className={cn(
          "mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums",
          tone === "gold" && "text-[var(--accent)]",
          tone === "success" && "text-[var(--success)]",
          tone === "danger" && "text-[var(--danger)]",
        )}>
          {value}
        </p>
        {hint && <p className="text-[10px] text-[var(--text-muted)]">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function MiniAlert({
  label,
  value,
  count,
  tone,
  href,
}: {
  label: string;
  value: string;
  count: string;
  tone: "danger" | "warning" | "info" | "neutral";
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors hover:brightness-[0.98]",
        tone === "danger" && "border-[var(--danger)]/20 bg-[var(--danger-soft)]",
        tone === "warning" && "border-[var(--warning)]/20 bg-[var(--warning-soft)]",
        tone === "info" && "border-[var(--info)]/20 bg-[var(--info-soft)]",
        tone === "neutral" && "border-[var(--border-default)] bg-[var(--bg-surface)]",
      )}
    >
      <div className="min-w-0">
        <p className={cn(
          "truncate text-[10px] font-semibold uppercase tracking-wide",
          tone === "danger" && "text-[var(--danger)]",
          tone === "warning" && "text-[var(--warning)]",
          tone === "info" && "text-[var(--info)]",
          tone === "neutral" && "text-[var(--text-muted)]",
        )}>
          {label}
        </p>
        <p className="text-sm font-bold tabular-nums">{value}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{count}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
    </Link>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(
        "font-semibold tabular-nums",
        tone === "danger" && "text-[var(--danger)]",
        tone === "success" && "text-[var(--success)]",
      )}>
        {value}
      </span>
    </div>
  );
}

void CalendarClock;
void AlertTriangle;
void Loader2;
void AreaChart;
void Area;
void Input;
