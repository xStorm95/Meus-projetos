"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Wallet, LockKeyhole, ArrowDownCircle, ArrowUpCircle, Printer, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, Clock, History, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateTimeBR, num, timeBR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, EmptyState, Alert, Modal, ConfirmDialog } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { CASH_BREAKDOWN_LABELS } from "@/lib/constants";

type Movement = {
  id: string;
  type: string;
  method: string | null;
  amount: string;
  description: string | null;
  userName: string | null;
  createdAt: string;
};

type Summary = {
  sessionId: string;
  code: string;
  openingAmount: string;
  cashIn: string;
  cashOut: string;
  expectedCash: string;
  byMethod: Array<{ method: string; label: string; total: string }>;
  salesTotal: string;
  withdrawals: string;
  supplies: string;
  refunds: string;
  movements: Movement[];
};

type Session = {
  id: string;
  code: string;
  openingAmount: string;
  openedAt: string;
  status: "OPEN" | "CLOSED";
  salesTotal: string;
  countedAmount: string | null;
  expectedAmount: string | null;
  difference: string | null;
  closingNotes: string | null;
  closedAt: string | null;
  openingNotes: string | null;
};

const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: "Abertura",
  SALE: "Venda",
  RECEIPT: "Recebimento",
  PAYMENT: "Pagamento",
  WITHDRAWAL: "Sangria",
  SUPPLY: "Suprimento / reforço",
  REFUND: "Estorno",
  CLOSING_ADJUSTMENT: "Ajuste de fechamento",
};

const BILLS = ["200", "100", "50", "20", "10", "5", "2", "1", "0.5", "0.25", "0.1"];

export function CashView({
  current,
  history,
  permissions,
  operatorName,
}: {
  current: { session: Session; summary: Summary } | null;
  history: Session[];
  permissions: { canOpen: boolean; canClose: boolean; canWithdraw: boolean };
  operatorName: string;
}) {
  const router = useRouter();
  const [openModal, setOpenModal] = React.useState(false);
  const [openAmount, setOpenAmount] = React.useState(0);
  const [openNotes, setOpenNotes] = React.useState("");
  const [moveModal, setMoveModal] = React.useState<null | "WITHDRAWAL" | "SUPPLY" | "RECEIPT" | "PAYMENT">(null);
  const [moveAmount, setMoveAmount] = React.useState(0);
  const [moveDescription, setMoveDescription] = React.useState("");
  const [closeModal, setCloseModal] = React.useState(false);
  const [counted, setCounted] = React.useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<(Summary & { session: Session; operatorName: string }) | null>(null);

  const session = current?.session;
  const summary = current?.summary;

  const countedTotal = Object.entries(counted).reduce(
    (acc, [bill, qty]) => acc + Number(bill) * (qty || 0),
    0,
  );
  const difference = session ? countedTotal - Number(summary?.expectedCash ?? 0) : 0;

  async function handleOpen() {
    setSaving(true);
    try {
      await api.post("/api/cash/sessions", {
        openingAmount: openAmount,
        notes: openNotes || undefined,
      });
      toast.success("Caixa aberto com sucesso.");
      setOpenModal(false);
      setOpenAmount(0);
      setOpenNotes("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement() {
    if (!session || !moveModal) return;
    if (!moveDescription.trim()) {
      toast.error("Informe a descrição/motivo.");
      return;
    }
    if (moveAmount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/cash/sessions/${session.id}/movements`, {
        type: moveModal,
        amount: moveAmount,
        description: moveDescription,
      });
      toast.success(
        moveModal === "WITHDRAWAL"
          ? "Sangria registrada."
          : moveModal === "SUPPLY"
            ? "Suprimento registrado."
            : "Movimentação registrada.",
      );
      setMoveModal(null);
      setMoveAmount(0);
      setMoveDescription("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!session) return;
    setSaving(true);
    try {
      const res = await api.post<{ difference: string }>(`/api/cash/sessions/${session.id}/close`, {
        countedBreakdown: counted,
        notes: closeNotes || undefined,
      });
      toast.success(`Caixa fechado. Diferença: ${brl(res.difference)}`);
      setCloseModal(false);
      setCounted({});
      setCloseNotes("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailId(id);
    setDetail(null);
    try {
      const res = await api.get<Summary & { session: Session; operatorName: string }>(`/api/cash/sessions/${id}`);
      setDetail(res);
    } catch (err) {
      toast.error(errorMessage(err));
      setDetailId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Caixa
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {session
              ? `Caixa ${session.code} aberto por ${operatorName} em ${dateTimeBR(session.openedAt)}`
              : "Nenhum caixa aberto no seu usuário"}
          </p>
        </div>
        {session ? (
          <div className="flex flex-wrap gap-2">
            {permissions.canWithdraw && (
              <>
                <Button variant="outline" size="sm" onClick={() => setMoveModal("SUPPLY")} leftIcon={<ArrowUpCircle className="h-3.5 w-3.5" />}>
                  Suprimento
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMoveModal("WITHDRAWAL")} leftIcon={<ArrowDownCircle className="h-3.5 w-3.5" />}>
                  Sangria
                </Button>
              </>
            )}
            <a href={`/api/cash/sessions/${session.id}/report`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />}>
                Relatório
              </Button>
            </a>
            {permissions.canClose && (
              <Button size="sm" onClick={() => setCloseModal(true)} leftIcon={<LockKeyhole className="h-3.5 w-3.5" />}>
                Fechar caixa
              </Button>
            )}
          </div>
        ) : (
          permissions.canOpen && (
            <Button size="sm" onClick={() => setOpenModal(true)} leftIcon={<Wallet className="h-4 w-4" />}>
              Abrir caixa
            </Button>
          )
        )}
      </div>

      {!session ? (
        <Card>
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="Caixa fechado"
            description="Abra o caixa para iniciar as operações do dia: o valor inicial informado será registrado no histórico e somado às movimentações."
            action={
              permissions.canOpen ? (
                <Button onClick={() => setOpenModal(true)} leftIcon={<Wallet className="h-4 w-4" />}>
                  Abrir caixa agora
                </Button>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Seu perfil não tem permissão para abrir caixa.
                </p>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <KpiBox label="Valor de abertura" value={brl(summary?.openingAmount)} icon={<Wallet className="h-3.5 w-3.5" />} />
            <KpiBox label="Entradas" value={brl(summary?.cashIn)} icon={<TrendingUp className="h-3.5 w-3.5" />} tone="success" />
            <KpiBox label="Saídas" value={brl(summary?.cashOut)} icon={<TrendingDown className="h-3.5 w-3.5" />} tone="danger" />
            <KpiBox label="Esperado em caixa" value={brl(summary?.expectedCash)} icon={<Wallet className="h-3.5 w-3.5" />} tone="gold" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Movimentações do caixa</CardTitle>
                  <CardDescription>{summary?.movements.length ?? 0} lançamento(s) nesta sessão</CardDescription>
                </div>
                <Badge tone="success">Aberto</Badge>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {!summary?.movements.length ? (
                  <EmptyState icon={<History className="h-6 w-6" />} title="Sem movimentações" description="As vendas e recebimentos do dia aparecerão aqui automaticamente." />
                ) : (
                  <div className="max-h-[440px] overflow-y-auto">
                    <table className="table-pro">
                      <thead>
                        <tr>
                          <th>Hora</th>
                          <th>Tipo</th>
                          <th>Descrição</th>
                          <th>Usuário</th>
                          <th className="text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...summary.movements].reverse().map((m) => (
                          <tr key={m.id}>
                            <td className="whitespace-nowrap text-[11px] tabular-nums">{timeBR(m.createdAt)}</td>
                            <td className="text-[11px]">
                              <span className="flex items-center gap-1">
                                {Number(m.amount) >= 0 ? (
                                  <ArrowUpCircle className="h-3 w-3 text-[var(--success)]" />
                                ) : (
                                  <ArrowDownCircle className="h-3 w-3 text-[var(--danger)]" />
                                )}
                                {MOVEMENT_LABELS[m.type] ?? m.type}
                              </span>
                            </td>
                            <td className="max-w-[240px] truncate text-[11px] text-[var(--text-muted)]">{m.description ?? "—"}</td>
                            <td className="text-[11px] text-[var(--text-muted)]">{m.userName ?? "—"}</td>
                            <td className={cn("text-right text-[11px] font-semibold tabular-nums", Number(m.amount) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                              {brl(m.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle>Totais por forma de pagamento</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  {!summary?.byMethod.length ? (
                    <p className="text-xs text-[var(--text-muted)]">Nenhum recebimento registrado.</p>
                  ) : (
                    summary.byMethod.map((m) => (
                      <div key={m.method} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">{m.label}</span>
                        <span className="font-semibold tabular-nums">{brl(m.total)}</span>
                      </div>
                    ))
                  )}
                  <div className="mt-2 space-y-1 border-t border-[var(--border-default)] pt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Vendas</span>
                      <span className="font-medium tabular-nums">{brl(summary?.salesTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Sangrias</span>
                      <span className="font-medium tabular-nums text-[var(--danger)]">{brl(summary?.withdrawals)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Suprimentos</span>
                      <span className="font-medium tabular-nums text-[var(--success)]">{brl(summary?.supplies)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Estornos</span>
                      <span className="font-medium tabular-nums text-[var(--danger)]">{brl(summary?.refunds)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Ações rápidas</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMoveModal("RECEIPT")}>Recebimento</Button>
                  <Button variant="outline" size="sm" onClick={() => setMoveModal("PAYMENT")}>Pagamento</Button>
                  <Button variant="outline" size="sm" onClick={() => setMoveModal("SUPPLY")}>Reforço</Button>
                  <Button variant="outline" size="sm" onClick={() => setMoveModal("WITHDRAWAL")}>Sangria</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Histórico de caixas */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Histórico de caixas</CardTitle>
            <CardDescription>Caixas encerrados são imutáveis e ficam disponíveis para consulta</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {history.length === 0 ? (
            <EmptyState icon={<History className="h-6 w-6" />} title="Nenhum caixa registrado" description="O histórico aparece após a abertura do primeiro caixa." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Abertura</th>
                    <th>Fechamento</th>
                    <th className="text-right">Abertura (R$)</th>
                    <th className="text-right">Vendas</th>
                    <th className="text-right">Esperado</th>
                    <th className="text-right">Contado</th>
                    <th className="text-right">Diferença</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="cursor-pointer" onClick={() => void loadDetail(s.id)}>
                      <td className="text-[11px] font-semibold">{s.code}</td>
                      <td className="whitespace-nowrap text-[11px]">{dateTimeBR(s.openedAt)}</td>
                      <td className="whitespace-nowrap text-[11px]">{s.closedAt ? dateTimeBR(s.closedAt) : "—"}</td>
                      <td className="text-right text-[11px] tabular-nums">{brl(s.openingAmount)}</td>
                      <td className="text-right text-[11px] tabular-nums">{brl(s.salesTotal)}</td>
                      <td className="text-right text-[11px] tabular-nums">{s.expectedAmount ? brl(s.expectedAmount) : "—"}</td>
                      <td className="text-right text-[11px] tabular-nums">{s.countedAmount ? brl(s.countedAmount) : "—"}</td>
                      <td className={cn(
                        "text-right text-[11px] font-semibold tabular-nums",
                        s.difference && Number(s.difference) !== 0
                          ? Number(s.difference) > 0 ? "text-[var(--info)]" : "text-[var(--danger)]"
                          : "text-[var(--success)]",
                      )}>
                        {s.difference ? brl(s.difference) : "—"}
                      </td>
                      <td>
                        <Badge tone={s.status === "OPEN" ? "success" : "neutral"}>
                          {s.status === "OPEN" ? "Aberto" : "Fechado"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal abrir caixa */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Abrir caixa"
        description="Informe o valor inicial (fundo de troco) disponível na gaveta"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleOpen()}>Abrir caixa</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Valor inicial (fundo de troco)" required>
            <MoneyInput value={openAmount} onChange={setOpenAmount} />
          </Field>
          <Field label="Observações">
            <Textarea value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} placeholder="Ex.: conferido com o gerente antes de abrir" />
          </Field>
          <Alert tone="info">
            O operador {operatorName} ficará responsável por este caixa. Movimentações posteriores serão
            registradas com seu usuário, data e hora.
          </Alert>
        </div>
      </Modal>

      {/* Modal movimentação */}
      <Modal
        open={Boolean(moveModal)}
        onClose={() => setMoveModal(null)}
        title={
          moveModal === "WITHDRAWAL"
            ? "Sangria (retirada de dinheiro)"
            : moveModal === "SUPPLY"
              ? "Suprimento (reforço de caixa)"
              : moveModal === "RECEIPT"
                ? "Recebimento avulso"
                : "Pagamento avulso"
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setMoveModal(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleMovement()}>Registrar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Valor" required>
            <MoneyInput value={moveAmount} onChange={setMoveAmount} />
          </Field>
          <Field label="Descrição / motivo" required>
            <Input
              value={moveDescription}
              onChange={(e) => setMoveDescription(e.target.value)}
              placeholder="Ex.: depósito bancário, troco adicional, pagamento de fornecedor"
            />
          </Field>
          {(moveModal === "WITHDRAWAL" || moveModal === "PAYMENT") && (
            <Alert tone="warning">
              Este valor sairá do caixa e será registrado no histórico com justificativa.
            </Alert>
          )}
        </div>
      </Modal>

      {/* Modal fechar caixa */}
      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title="Fechamento de caixa"
        description="Faça a conferência do dinheiro físico na gaveta"
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCloseModal(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleClose()}>
              Confirmar fechamento
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--bg-muted)] p-3">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]">Valor esperado em dinheiro</span>
              <span className="font-bold tabular-nums">{brl(summary?.expectedCash)}</span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Contagem de cédulas e moedas
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BILLS.map((bill) => (
                <div key={bill} className="flex items-center gap-1.5">
                  <span className="w-20 shrink-0 text-[10px] text-[var(--text-secondary)]">
                    {CASH_BREAKDOWN_LABELS[bill]}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={counted[bill] ?? ""}
                    onChange={(e) =>
                      setCounted((prev) => ({ ...prev, [bill]: Number(e.target.value) || 0 }))
                    }
                    placeholder="0"
                    className="field h-8 py-0 text-right text-xs tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-[var(--border-default)] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Total contado</span>
              <span className="font-bold tabular-nums">{brl(countedTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Valor esperado</span>
              <span className="font-semibold tabular-nums">{brl(summary?.expectedCash)}</span>
            </div>
            <div className={cn(
              "flex justify-between border-t border-[var(--border-default)] pt-1.5 font-bold",
              Math.abs(difference) < 0.005 ? "text-[var(--success)]" : difference > 0 ? "text-[var(--info)]" : "text-[var(--danger)]",
            )}>
              <span>Diferença</span>
              <span className="tabular-nums">{brl(difference)}</span>
            </div>
          </div>

          {Math.abs(difference) > 0.005 && (
            <Alert tone={difference > 0 ? "info" : "warning"} title="Diferença detectada">
              {difference > 0
                ? "Há sobra de caixa. Confira a contagem antes de confirmar."
                : "Há falta de caixa. Registre uma justificativa no campo de observações."}
            </Alert>
          )}

          <Field label="Observações do fechamento">
            <Textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Justificativas, ocorrências, conferência com gerente..."
            />
          </Field>
        </div>
      </Modal>

      {/* Detalhe de caixa anterior */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail ? `Caixa ${detail.code}` : "Carregando caixa"}
        size="lg"
      >
        {!detail ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <a href={`/api/cash/sessions/${detail.session.id}/report`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" leftIcon={<Printer className="h-3.5 w-3.5" />}>
                  Imprimir relatório
                </Button>
              </a>
              <Badge tone={detail.session.status === "OPEN" ? "success" : "neutral"}>
                {detail.session.status === "OPEN" ? "Em aberto" : "Fechado"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Abertura" value={brl(detail.openingAmount)} />
              <MiniStat label="Entradas" value={brl(detail.cashIn)} />
              <MiniStat label="Saídas" value={brl(detail.cashOut)} />
              <MiniStat label="Esperado" value={brl(detail.expectedCash)} />
            </div>
            {detail.session.status === "CLOSED" && (
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Contado" value={brl(detail.session.countedAmount)} />
                <MiniStat label="Esperado" value={brl(detail.session.expectedAmount)} />
                <MiniStat
                  label="Diferença"
                  value={brl(detail.session.difference)}
                  tone={Number(detail.session.difference ?? 0) === 0 ? "success" : "danger"}
                />
              </div>
            )}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-default)]">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th className="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-[11px]">{timeBR(m.createdAt)}</td>
                      <td className="text-[11px]">{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                      <td className="max-w-[220px] truncate text-[11px] text-[var(--text-muted)]">{m.description ?? "—"}</td>
                      <td className={cn("text-right text-[11px] font-semibold tabular-nums", Number(m.amount) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                        {brl(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.session.closingNotes && (
              <p className="rounded-lg bg-[var(--bg-muted)] p-2 text-[11px] text-[var(--text-secondary)]">
                <strong>Observações:</strong> {detail.session.closingNotes}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function KpiBox({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "gold" | "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-[var(--text-muted)]",
            tone === "gold" && "text-[var(--accent)]",
            tone === "success" && "text-[var(--success)]",
            tone === "danger" && "text-[var(--danger)]",
          )}
        >
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
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] p-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={cn(
        "text-xs font-bold tabular-nums",
        tone === "success" && "text-[var(--success)]",
        tone === "danger" && "text-[var(--danger)]",
      )}>
        {value}
      </p>
    </div>
  );
}

void Clock;
void CheckCircle2;
void AlertTriangle;
void num;
void Select;
void ConfirmDialog;
