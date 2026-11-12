"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Crown,
  Info,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { brl, cn, num, pct } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { CurvaAbc, MetasResumo } from "@/server/services/dashboard";
import type { ComparativoLojas } from "@/server/services/platform";

/**
 * Painéis analíticos (etapa 4).
 *
 * Princípio que veio da etapa 2 e vale aqui: nada de número inventado.
 *  - sem meta cadastrada → "—" e um pedido para cadastrar, nunca 0%/100%;
 *  - sem base de comparação → "—", nunca "+100%";
 *  - curva ABC é sempre do PERÍODO selecionado (a tela diz isso).
 */
type Props = {
  curvaProdutos: CurvaAbc;
  curvaClientes: CurvaAbc;
  metas: MetasResumo;
  lojas: ComparativoLojas | null;
  /** A tela de comparação entre lojas só aparece para quem administra. */
  podeVerLojas: boolean;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
};

const CLASSE_TONE: Record<"A" | "B" | "C", string> = {
  A: "bg-[var(--success)]/15 text-[var(--success)]",
  B: "bg-[var(--warning)]/15 text-[var(--warning)]",
  C: "bg-[var(--bg-muted)] text-[var(--text-muted)]",
};

export function InsightsView({
  curvaProdutos,
  curvaClientes,
  metas,
  lojas,
  podeVerLojas,
  periodLabel,
  periodFrom,
  periodTo,
}: Props) {
  const [aba, setAba] = React.useState<"produtos" | "clientes">("produtos");
  const curva = aba === "produtos" ? curvaProdutos : curvaClientes;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Painéis
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Curva ABC, metas da equipe e comparação entre lojas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{periodLabel || `${periodFrom} a ${periodTo}`}</Badge>
          <Link href={`/dashboard?from=${periodFrom}&to=${periodTo}`}>
            <Button variant="outline" size="sm" leftIcon={<BarChart3 className="h-3.5 w-3.5" />}>
              Ver dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* ---------------- Curva ABC ---------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Curva ABC</CardTitle>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Classe A = itens que somam 80% da receita do período · B até 95% · C o restante
            </p>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border-default)]">
            {(["produtos", "clientes"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-medium capitalize transition-colors",
                  aba === k
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)]",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {curva.itens.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-6 w-6" />}
              title="Sem vendas no período"
              description="A curva ABC precisa de vendas concluídas para ser calculada."
              action={
                <Link href="/pdv">
                  <Button size="sm">Iniciar venda</Button>
                </Link>
              }
            />
          ) : (
            <>
              {/* resumo das classes */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["A", curva.classeA, "Os que sustentam o caixa"],
                  ["B", curva.classeB, "Intermediários"],
                  ["C", curva.classeC, "Cauda longa"],
                ] as const).map(([classe, resumo, desc]) => (
                  <div
                    key={classe}
                    className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/40 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                          CLASSE_TONE[classe],
                        )}
                      >
                        {classe}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        {resumo.itens} item(ns)
                      </span>
                    </div>
                    <p className="mt-1 text-base font-bold tabular-nums">{brl(resumo.receita)}</p>
                    <p className="text-[10.5px] text-[var(--text-muted)]">
                      {pct(resumo.share)} da receita · {desc}
                    </p>
                  </div>
                ))}
              </div>

              {/* barras empilhadas por classe */}
              <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                <div className="bg-[var(--success)]" style={{ width: `${curva.classeA.share}%` }} />
                <div className="bg-[var(--warning)]" style={{ width: `${curva.classeB.share}%` }} />
                <div className="bg-[var(--border-strong)]" style={{ width: `${curva.classeC.share}%` }} />
              </div>

              {/* tabela */}
              <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">{aba === "produtos" ? "Produto" : "Cliente"}</th>
                      <th className="px-3 py-2 text-right">{aba === "produtos" ? "Qtd" : "Compras"}</th>
                      <th className="px-3 py-2 text-right">Receita</th>
                      <th className="px-3 py-2 text-right">% do total</th>
                      <th className="px-3 py-2 text-right">Acumulado</th>
                      <th className="px-3 py-2 text-center">Classe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curva.itens.slice(0, 50).map((item, i) => (
                      <tr key={`${item.nome}-${i}`} className="border-t border-[var(--border-subtle)]">
                        <td className="px-3 py-1.5 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <p className="font-medium">{item.nome}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{item.detalhe}</p>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{num(item.quantidade)}</td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">{brl(item.receita)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pct(item.share)}</td>
                        <td className="px-3 py-1.5 text-right text-[var(--text-muted)] tabular-nums">
                          {pct(item.acumulado)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <span
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                              CLASSE_TONE[item.classe],
                            )}
                          >
                            {item.classe}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {curva.itens.length > 50 && (
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  Mostrando os 50 primeiros de {num(curva.itens.length)}. Exporte o relatório para a
                  lista completa.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ---------------- Metas ---------------- */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[var(--accent)]" /> Metas do mês
              </CardTitle>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Mês corrente · projeção pela média diária até hoje
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {metas.hoje.meta === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-default)] px-3 py-4 text-center">
                <p className="text-xs font-semibold">Nenhuma meta cadastrada</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] text-[var(--text-muted)]">
                  Sem meta não há como medir progresso — por isso não mostramos “0%” nem “100%”.
                  Cadastre a meta mensal de cada vendedor.
                </p>
                <Link href="/usuarios" className="mt-2 inline-block">
                  <Button size="sm" variant="outline">
                    Cadastrar metas
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-[var(--bg-muted)]/50 px-3 py-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        Realizado no mês
                      </p>
                      <p className="text-xl font-bold tabular-nums">{brl(metas.hoje.realizado)}</p>
                      <p className="text-[10.5px] text-[var(--text-muted)]">
                        de {brl(metas.hoje.meta)} ·{" "}
                        {metas.hoje.progresso === null ? "—" : pct(metas.hoje.progresso)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        Projeção do mês
                      </p>
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          (metas.hoje.projecaoMes ?? 0) >= metas.hoje.meta
                            ? "text-[var(--success)]"
                            : "text-[var(--warning)]",
                        )}
                      >
                        {metas.hoje.projecaoMes === null ? "—" : brl(metas.hoje.projecaoMes)}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">no ritmo atual</p>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.min(100, metas.hoje.progresso ?? 0)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {metas.vendedores.slice(0, 8).map((v) => (
                    <div key={v.id} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                          <p className="text-xs font-medium">{v.nome}</p>
                          {v.meta === 0 && <Badge tone="warning">sem meta</Badge>}
                        </div>
                        <p className="text-xs font-semibold tabular-nums">
                          {v.progresso === null ? "—" : pct(v.progresso)}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            (v.progresso ?? 0) >= 100
                              ? "bg-[var(--success)]"
                              : (v.progresso ?? 0) >= 60
                                ? "bg-[var(--accent)]"
                                : "bg-[var(--warning)]",
                          )}
                          style={{ width: `${Math.min(100, v.progresso ?? 0)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
                        {brl(v.realizado)}
                        {v.meta > 0 ? ` de ${brl(v.meta)} · faltam ${brl(v.faltam ?? 0)}` : " no mês"}
                        {v.projecao !== null && ` · projeção ${brl(v.projecao)}`}
                      </p>
                    </div>
                  ))}
                </div>

                {metas.semMeta > 0 && (
                  <p className="flex items-start gap-1.5 text-[10.5px] text-[var(--text-muted)]">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {metas.semMeta} pessoa(s) sem meta cadastrada — o progresso delas fica “—”.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ---------------- Comparativo entre lojas ---------------- */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[var(--accent)]" /> Comparativo de lojas
              </CardTitle>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Só totais por loja — clientes e vendas de outra loja nunca aparecem
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!podeVerLojas || !lojas ? (
              <div className="rounded-xl border border-dashed border-[var(--border-default)] px-3 py-5 text-center">
                <Building2 className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                <p className="mt-1 text-xs font-semibold">Comparativo indisponível</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] text-[var(--text-muted)]">
                  Cada loja vê apenas os próprios dados. O comparativo entre lojas é exclusivo de
                  quem administra a plataforma (veja <code>PLATFORM_ADMIN_EMAILS</code>).
                </p>
              </div>
            ) : lojas.lojas.length === 1 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-default)] px-3 py-5 text-center">
                <p className="text-xs font-semibold">Existe uma loja só</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] text-[var(--text-muted)]">
                  Não há o que comparar. Cada novo cadastro em <code>/cadastro</code> cria uma loja
                  independente.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Lojas</p>
                    <p className="text-base font-bold tabular-nums">{num(lojas.totais.lojas)}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Faturamento</p>
                    <p className="text-base font-bold tabular-nums">{brl(lojas.totais.faturamento)}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Vendas</p>
                    <p className="text-base font-bold tabular-nums">{num(lojas.totais.vendas)}</p>
                  </div>
                </div>

                <div className="dark-scroll max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {lojas.lojas.map((l, i) => (
                    <div
                      key={l.id}
                      className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {i === 0 && <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--gold-500)]" />}
                          <p className="truncate text-xs font-medium">{l.nome}</p>
                          {l.status !== "ACTIVE" && <Badge tone="danger">{l.status}</Badge>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-xs font-semibold tabular-nums">{brl(l.faturamento)}</span>
                          {l.variacao === null ? (
                            <span className="text-[10px] text-[var(--text-muted)]" title="Sem base de comparação">
                              —
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-0.5 text-[10px] font-medium tabular-nums",
                                l.variacao >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
                              )}
                            >
                              {l.variacao >= 0 ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {pct(Math.abs(l.variacao))}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                        {num(l.vendas)} venda(s) · ticket {brl(l.ticketMedio)} · {num(l.produtos)}{" "}
                        produto(s) · estoque a custo {brl(l.estoque)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  Período {lojas.periodo.from.slice(8, 10)}/{lojas.periodo.from.slice(5, 7)} a{" "}
                  {lojas.periodo.to.slice(8, 10)}/{lojas.periodo.to.slice(5, 7)} · variação contra{" "}
                  {lojas.anterior.from.slice(8, 10)}/{lojas.anterior.from.slice(5, 7)} a{" "}
                  {lojas.anterior.to.slice(8, 10)}/{lojas.anterior.to.slice(5, 7)}. “—” = sem base
                  de comparação.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-start gap-1.5 px-1 text-[10.5px] text-[var(--text-muted)]">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        Lucro e curva consideram apenas vendas concluídas e o custo cadastrado no momento da venda.
        Item vendido sem custo entra com custo zero — confira o aviso no dashboard antes de decidir
        preço.
      </p>
    </div>
  );
}
