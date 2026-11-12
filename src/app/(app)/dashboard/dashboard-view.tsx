"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownRight, ArrowUpRight, Banknote, Calendar, CalendarDays, ChevronDown, CreditCard,
  Package, ShoppingBag, TrendingUp, Users, Wallet, AlertTriangle, Receipt, Target,
  ArrowRight, PiggyBank, Percent, UserPlus, UserCheck, UserX, RefreshCw, Download,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie,
  PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brl, cn, dateBR, num, pct, todayISO } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { DashboardResult } from "@/server/services/dashboard";
import { PAYMENT_METHODS, PERIOD_PRESETS } from "@/lib/constants";

const METHOD_COLORS: Record<string, string> = {
  CASH: "#c9a227",
  PIX: "#0f766e",
  DEBIT: "#1d4ed8",
  CREDIT: "#7c3aed",
  STORE_CREDIT: "#c2707f",
  TRANSFER: "#0891b2",
  OTHER: "#85858f",
};

const CHART_GOLD = "#c9a227";
const CHART_ROSE = "#d8a0a6";

/**
 * Saudação pelo horário de Brasília (o do servidor pode ser UTC).
 * Capitalização natural: "Bom dia", "Boa tarde", "Boa noite".
 */
function saudacaoDoDia(agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(agora),
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function DashboardView({
  data,
  evolution,
  preset,
  periodLabel,
  userName,
  canSeeFinance,
  companyName,
  monthlyGoal,
}: {
  data: DashboardResult;
  evolution: Array<{ month: string; label: string; revenue: number; sales: number; profit: number }>;
  preset: string;
  periodLabel: string;
  userName: string;
  canSeeFinance: boolean;
  companyName: string;
  monthlyGoal: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [customFrom, setCustomFrom] = React.useState(data.period.from);
  const [customTo, setCustomTo] = React.useState(data.period.to);
  const [showCustom, setShowCustom] = React.useState(false);

  function applyPeriod(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", value);
    if (value === "custom") {
      next.set("from", customFrom);
      next.set("to", customTo);
    } else {
      next.delete("from");
      next.delete("to");
    }
    router.push(`/dashboard?${next.toString()}`);
  }

  /*
   * A saudação é calculada no cliente: no servidor o horário é UTC e a
   * hidratação reclamaria da diferença. O primeiro render usa "Olá" e o
   * efeito troca pelo horário da loja.
   */
  const [saudacao, setSaudacao] = React.useState("Olá");
  React.useEffect(() => {
    setSaudacao(saudacaoDoDia());
  }, []);

  /*
   * Aviso de custo ausente (consulta `custoAusente` do dashboard).
   * `itens`      = linhas de venda sem custo · `itensTotal` = todas as linhas.
   * `semCustoTotal` significa que nada no período tem custo, logo não há lucro
   * para mostrar; caso contrário o lucro vale, mas sai subestimado no custo.
   */
  const semCusto = data.semCusto ?? { itens: 0, itensTotal: 0, produtos: 0, receita: "0.00" };
  // Comparação na mesma unidade: linhas de venda contra linhas de venda.
  const semCustoTotal = semCusto.itens > 0 && semCusto.itens >= semCusto.itensTotal;

  const goalNumber = Number(monthlyGoal) > 0 ? Number(monthlyGoal) : 0;
  const monthRevenue = Number(data.month.revenue);
  const goalProgress = goalNumber > 0 ? Math.min(100, (monthRevenue / goalNumber) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            {companyName}
          </p>
          <h1 className="mt-0.5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
            {/* Saudação pelo horário da loja (Brasília), não pelo do servidor. */}
            {saudacao}, {userName}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Visão de <strong className="font-semibold text-[var(--text-secondary)]">{periodLabel}</strong>{" "}
            · {dateBR(data.period.from)} a {dateBR(data.period.to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  if (p.value === "custom") {
                    setShowCustom(true);
                    return;
                  }
                  setShowCustom(false);
                  applyPeriod(p.value);
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                  preset === p.value
                    ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => router.refresh()}
          >
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              window.location.href = `/api/reports/sales/export?format=csv&from=${data.period.from}&to=${data.period.to}`;
            }}
          >
            Exportar
          </Button>
        </div>
      </div>

      {showCustom && (
        <Card className="animate-fade-in">
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div>
              <label className="label">De</label>
              <input
                type="date"
                className="field w-auto"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Até</label>
              <input
                type="date"
                className="field w-auto"
                value={customTo}
                max={todayISO()}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
            <Button onClick={() => applyPeriod("custom")}>
              <CalendarDays className="h-4 w-4" /> Aplicar período
            </Button>
            <Button variant="ghost" onClick={() => setShowCustom(false)}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Faturamento do período"
          value={brl(data.current.revenue)}
          hint={`Hoje: ${brl(data.today.revenue)}`}
          icon={<Banknote className="h-4 w-4" />}
          variation={data.variations.revenue}
          atual={Number(data.current.revenue)}
          tone="gold"
        />
        <KpiCard
          label="Vendas realizadas"
          value={num(data.current.salesCount)}
          hint={`${num(data.current.itemCount)} peças vendidas`}
          icon={<ShoppingBag className="h-4 w-4" />}
          variation={data.variations.salesCount}
          atual={data.current.salesCount}
        />
        <KpiCard
          label="Ticket médio"
          value={brl(data.current.ticketAverage)}
          hint={`${num(data.current.itemCount)} itens no período`}
          icon={<Receipt className="h-4 w-4" />}
          variation={data.variations.ticketAverage}
          atual={Number(data.current.ticketAverage)}
        />
        {canSeeFinance ? (
          /*
           * Custo ausente distorce o lucro: `sale_items.unit_cost` é NOT NULL
           * com default 0, então produto sem custo entra como lucro cheio.
           * Quando TODOS os itens do período estão sem custo, mostramos "—"
           * em vez de um número inventado. Quando é só parte, mantemos o valor
           * válido e avisamos quantos itens estão fora do cálculo.
           */
          semCustoTotal ? (
            <KpiCard
              label="Lucro estimado"
              value="—"
              hint={`${num(data.semCusto.itens)} itens sem custo cadastrado`}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="success"
            />
          ) : (
            <KpiCard
              label="Lucro estimado"
              value={brl(data.current.profit)}
              hint={`Margem ${pct(data.marginPercent)} · descontos ${brl(data.current.discounts)}`}
              icon={<TrendingUp className="h-4 w-4" />}
              variation={data.variations.profit}
              atual={Number(data.current.profit)}
              tone="success"
            />
          )
        ) : (
          <KpiCard
            label="Peças vendidas"
            value={num(data.current.itemCount)}
            hint="Quantidade de itens no período"
            icon={<Package className="h-4 w-4" />}
            variation={data.variations.itemCount}
            atual={data.current.itemCount}
          />
        )}
      </div>

      {/* Custo ausente: avisa sem esconder o resto do painel */}
      {canSeeFinance && semCusto.itens > 0 && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning-soft)]">
          <CardContent className="flex flex-wrap items-start gap-3 pt-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {semCustoTotal
                  ? "O lucro não pode ser calculado neste período"
                  : `Lucro parcial: ${num(semCusto.itens)} de ${num(semCusto.itensTotal)} itens sem custo`}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {num(semCusto.produtos)} {semCusto.produtos === 1 ? "produto está" : "produtos estão"} sem
                custo de compra cadastrado
                {Number(semCusto.receita) > 0 && ` (${brl(semCusto.receita)} em vendas)`}. Sem o custo, a
                venda entra como lucro cheio e o resultado fica maior do que o real.
              </p>
            </div>
            <Link
              href="/produtos"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-xs font-medium transition-colors hover:bg-[var(--bg-muted)]"
            >
              Cadastrar custos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Financeiro */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="Faturamento do mês"
          value={brl(data.month.revenue)}
          icon={<Calendar className="h-3.5 w-3.5" />}
          subtitle={`${num(data.month.salesCount)} vendas`}
        />
        {canSeeFinance && (
          <>
            <MiniStat
              label="Despesas pagas"
              value={brl(data.expenses)}
              icon={<Wallet className="h-3.5 w-3.5" />}
              tone="danger"
              subtitle={
                semCustoTotal ? "Resultado estimado — (sem custos)" : `Resultado estimado ${brl(data.estimatedResult)}`
              }
            />
            <MiniStat
              label="Saldo em caixa"
              value={brl(data.cashBalance)}
              icon={<PiggyBank className="h-3.5 w-3.5" />}
              subtitle="Caixas abertos"
            />
          </>
        )}
        <MiniStat
          label="Contas a receber"
          value={brl(data.receivables.open)}
          icon={<CreditCard className="h-3.5 w-3.5" />}
          tone={Number(data.receivables.overdue) > 0 ? "warning" : undefined}
          subtitle={
            Number(data.receivables.overdue) > 0
              ? `${brl(data.receivables.overdue)} vencido`
              : `${num(data.receivables.installments)} parcelas abertas`
          }
        />
        {canSeeFinance && (
          <MiniStat
            label="Contas a pagar"
            value={brl(data.payables.open)}
            icon={<Wallet className="h-3.5 w-3.5" />}
            tone={Number(data.payables.overdue) > 0 ? "danger" : undefined}
            subtitle={
              Number(data.payables.overdue) > 0
                ? `${brl(data.payables.overdue)} vencido`
                : `${num(data.payables.installments)} parcelas abertas`
            }
          />
        )}
      </div>

      {/* Meta do mês */}
      {goalNumber > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Target className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold">Meta do mês</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {brl(monthRevenue)} de {brl(goalNumber)}
                  </p>
                </div>
              </div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
                {pct(goalProgress, 0)}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--gold-500)] to-[var(--rose-400)] transition-all duration-700"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Evolução do faturamento</CardTitle>
              <CardDescription>Receita diária e quantidade de vendas no período selecionado</CardDescription>
            </div>
            <Badge tone="gold">{periodLabel}</Badge>
          </CardHeader>
          <CardContent>
            {data.chart.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-6 w-6" />}
                title="Sem vendas no período"
                description="Assim que houver vendas finalizadas, o gráfico será exibido aqui."
                action={
                  <Link href="/pdv">
                    <Button size="sm">Iniciar venda</Button>
                  </Link>
                }
              />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.chart} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GOLD} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--text-primary)",
                    }}
                    formatter={((value: unknown, name: unknown) => [
                      name === "revenue" ? brl(Number(value)) : num(Number(value)),
                      name === "revenue" ? "Faturamento" : "Vendas",
                    ]) as never}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={CHART_GOLD} strokeWidth={2} fill="url(#gradRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Formas de pagamento</CardTitle>
              <CardDescription>Distribuição do recebimento</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.paymentMix.length === 0 ? (
              <EmptyState title="Sem pagamentos" description="Nenhuma venda finalizada no período." />
            ) : (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={data.paymentMix.map((p) => ({
                        name: PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method,
                        value: Number(p.total),
                        method: p.method,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={62}
                      paddingAngle={2}
                    >
                      {data.paymentMix.map((p) => (
                        <Cell key={p.method} fill={METHOD_COLORS[p.method] ?? "#85858f"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                      formatter={((v: unknown) => brl(Number(v))) as never}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-1.5">
                  {data.paymentMix.map((p) => {
                    const total = data.paymentMix.reduce((a, b) => a + Number(b.total), 0);
                    return (
                      <li key={p.method} className="flex items-center gap-2 text-[11px]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: METHOD_COLORS[p.method] ?? "#85858f" }}
                        />
                        <span className="flex-1 truncate text-[var(--text-secondary)]">
                          {PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                        </span>
                        <span className="font-semibold tabular-nums">{brl(p.total)}</span>
                        <span className="w-9 text-right text-[var(--text-muted)]">
                          {total > 0 ? pct((Number(p.total) / total) * 100, 0) : "0%"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Últimos 6 meses</CardTitle>
              <CardDescription>Faturamento e lucro mensal</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {evolution.length === 0 ? (
              <EmptyState title="Histórico insuficiente" description="Os dados aparecem após o primeiro mês com vendas." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={evolution} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                    formatter={((v: unknown, name: unknown) => [brl(Number(v)), name === "revenue" ? "Faturamento" : "Lucro"]) as never}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "revenue" ? "Faturamento" : "Lucro")} />
                  <Bar dataKey="revenue" fill={CHART_GOLD} radius={[6, 6, 0, 0]} maxBarSize={38} />
                  <Bar dataKey="profit" fill={CHART_ROSE} radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>Comportamento da base</CardDescription>
            </div>
            <Link href="/clientes" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <ClientStat icon={<UserPlus className="h-3.5 w-3.5" />} label="Novos" value={data.customers.new} tone="success" />
              <ClientStat icon={<UserCheck className="h-3.5 w-3.5" />} label="Recorrentes" value={data.customers.recurring} tone="info" />
              <ClientStat icon={<UserX className="h-3.5 w-3.5" />} label="Inativos" value={data.customers.inactive} tone="warning" />
            </div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/60 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  <Percent className="h-3 w-3" /> Taxa de recompra
                </span>
                <span className="text-sm font-bold tabular-nums">{pct(data.customers.repurchaseRate)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.min(100, data.customers.repurchaseRate)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                Clientes com 2 ou mais compras
              </p>
            </div>
            {data.topCustomers.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Mais compram no período
                </p>
                <ul className="space-y-1">
                  {data.topCustomers.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <Link href={`/clientes/${c.id}`} className="truncate font-medium hover:text-[var(--accent)]">
                        {c.name}
                      </Link>
                      <span className="shrink-0 font-semibold tabular-nums">{brl(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Produtos mais vendidos</CardTitle>
              <CardDescription>Ranking por quantidade no período</CardDescription>
            </div>
            <Link href="/relatorios" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
              Relatórios
            </Link>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.topProducts.length === 0 ? (
              <EmptyState icon={<Package className="h-6 w-6" />} title="Nenhum produto vendido" description="Não há vendas registradas no período selecionado." />
            ) : (
              <ul className="divide-y divide-[var(--border-default)]">
                {data.topProducts.map((p, i) => (
                  <li key={`${p.reference}-${p.variant}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{p.name}</p>
                      <p className="truncate text-[10px] text-[var(--text-muted)]">
                        Ref. {p.reference} · {p.variant}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold tabular-nums">{num(p.quantity)} un.</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{brl(p.revenue)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Estoque baixo
                  {data.lowStock.length > 0 && (
                    <Badge tone="warning">{data.lowStock.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>Variações no limite mínimo — reponha para não perder vendas</CardDescription>
              </div>
              <Link href="/estoque" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
                Estoque
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {data.lowStock.length === 0 ? (
                <EmptyState icon={<Package className="h-6 w-6" />} title="Estoque saudável" description="Nenhuma variação atingiu o estoque mínimo." />
              ) : (
                <ul className="max-h-64 divide-y divide-[var(--border-default)] overflow-y-auto">
                  {data.lowStock.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                      <AlertTriangle
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          v.quantity <= 0 ? "text-[var(--danger)]" : "text-[var(--warning)]",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{v.name}</p>
                        <p className="truncate text-[10px] text-[var(--text-muted)]">
                          {v.sku} · {v.variation}
                        </p>
                      </div>
                      <Badge tone={v.quantity <= 0 ? "danger" : "warning"}>
                        {num(v.quantity)} / {num(v.minimum)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canSeeFinance && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Alertas financeiros</CardTitle>
                  <CardDescription>Vencidos e a vencer</CardDescription>
                </div>
                <Link href="/financeiro" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
                  Financeiro
                </Link>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                    A receber vencido
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-[var(--danger)]">
                    {brl(data.receivables.overdue)}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{num(data.overdue.receivables.count)} parcelas</p>
                </div>
                <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-soft)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]">
                    A pagar vencido
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-[var(--warning)]">
                    {brl(data.payables.overdue)}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{num(data.overdue.payables.count)} contas</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Ações rápidas */}
      <Card>
        <CardHeader>
          <CardTitle>Ações rápidas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Nova venda", href: "/pdv", icon: <ShoppingBag className="h-4 w-4" /> },
            { label: "Novo produto", href: "/produtos/novo", icon: <Package className="h-4 w-4" /> },
            { label: "Novo cliente", href: "/clientes/novo", icon: <Users className="h-4 w-4" /> },
            { label: "Abrir/fechar caixa", href: "/caixa", icon: <Wallet className="h-4 w-4" /> },
            { label: "Contas a pagar", href: "/financeiro/contas-a-pagar", icon: <CreditCard className="h-4 w-4" /> },
            { label: "Relatórios", href: "/relatorios", icon: <TrendingUp className="h-4 w-4" /> },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col items-center gap-2 rounded-xl border border-[var(--border-default)] p-3 text-center transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <span className="text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent)]">
                {action.icon}
              </span>
              <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  variation,
  tone,
  variationInvertida,
  atual,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  /** null = sem base de comparação (período anterior zerado) → "Novo". */
  variation?: number | null;
  tone?: "gold" | "success" | "danger";
  /** Despesa/custo: cair é bom, então a cor se inverte. */
  variationInvertida?: boolean;
  /** Valor atual do indicador — define se "Novo" faz sentido. */
  atual?: number;
}) {
  /*
   * Semântica do badge:
   *  - null          → "Novo" (não existia base antes). NUNCA "100%".
   *  - 0             → neutro (cinza): não mudou.
   *  - positivo      → verde (ou vermelho, se for despesa).
   *  - negativo      → vermelho (ou verde, se for despesa).
   */
  /*
   * "Novo" só é honesto quando o indicador realmente saiu de zero. Um ticket
   * médio ou um lucro que existe nos dois períodos mas estava zerado antes
   * (sem custo cadastrado, por exemplo) não é "novidade" — é "—".
   */
  const temAtual = atual === undefined || atual > 0;
  const semBase = (variation === null || variation === undefined) && temAtual;
  const semComparacao = (variation === null || variation === undefined) && !temAtual;
  const neutro = !semBase && !semComparacao && variation === 0;
  const subiu = !semBase && !semComparacao && (variation as number) > 0;
  const bom = variationInvertida ? !subiu : subiu;
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-[var(--shadow-card)]">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          tone === "gold" && "bg-[var(--accent)]",
          tone === "success" && "bg-[var(--success)]",
          tone === "danger" && "bg-[var(--danger)]",
          !tone && "bg-[var(--border-strong)]",
        )}
      />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {label}
          </p>
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              tone === "gold" && "bg-[var(--accent-soft)] text-[var(--accent)]",
              tone === "success" && "bg-[var(--success-soft)] text-[var(--success)]",
              tone === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
              !tone && "bg-[var(--bg-muted)] text-[var(--text-secondary)]",
            )}
          >
            {icon}
          </span>
        </div>
        {/* Valor principal: display + tabular-nums para não "pular" ao atualizar. */}
        <p
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums tracking-tight"
          title={value}
        >
          {value}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {semBase ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]"
              title="Sem vendas no período anterior para comparar"
            >
              Novo
            </span>
          ) : semComparacao ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]"
              title="Sem base de comparação no período anterior"
            >
              —
            </span>
          ) : neutro ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
              {pct(0)}
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                bom
                  ? "bg-[var(--success-soft)] text-[var(--success)]"
                  : "bg-[var(--danger-soft)] text-[var(--danger)]",
              )}
            >
              {subiu ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
              {pct(Math.abs(variation as number))}
            </span>
          )}
          {hint && <span className="truncate text-[10px] text-[var(--text-muted)]">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  icon,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          tone === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
          tone === "warning" && "bg-[var(--warning-soft)] text-[var(--warning)]",
          !tone && "bg-[var(--bg-muted)] text-[var(--text-secondary)]",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        <p className="truncate text-sm font-bold tabular-nums">{value}</p>
        {subtitle && <p className="truncate text-[10px] text-[var(--text-muted)]">{subtitle}</p>}
      </div>
    </div>
  );
}

function ClientStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "success" | "info" | "warning";
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] p-2 text-center">
      <span
        className={cn(
          "mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-md",
          tone === "success" && "bg-[var(--success-soft)] text-[var(--success)]",
          tone === "info" && "bg-[var(--info-soft)] text-[var(--info)]",
          tone === "warning" && "bg-[var(--warning-soft)] text-[var(--warning)]",
        )}
      >
        {icon}
      </span>
      <p className="text-sm font-bold tabular-nums">{num(value)}</p>
      <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

void ArrowRight;
void ChevronDown;
void LineChart;
void Line;
