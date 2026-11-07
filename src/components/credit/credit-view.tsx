"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard, AlertTriangle, TrendingUp, Wallet, Users, Percent, HandCoins, RefreshCw,
  ChevronRight, Phone, Download, ShieldCheck, History,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";

type Delinquent = {
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  total: string;
  installments: number;
  oldestDue: string;
};

type OpenInstallment = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  description: string | null;
  dueDate: string;
  amount: string;
  paidAmount: string;
  penaltyAmount: string;
  interestAmount: string;
  status: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  saleNumber: number | null;
};

export function CreditView({
  data,
  customers,
  permissions,
}: {
  data: {
    totals: {
      totalOpen: string;
      totalOverdue: string;
      totalUpcoming: string;
      paidCount: number;
      pendingCount: number;
      overdueCount: number;
    };
    delinquents: Delinquent[];
    installments: OpenInstallment[];
    renegotiations: Array<{
      id: string;
      customerName: string | null;
      originalAmount: string;
      newAmount: string;
      installments: number;
      firstDueDate: string;
      createdAt: string;
      userName: string | null;
    }>;
    settings: { penalty: string; dailyInterest: string; graceDays: number };
    creditUsage: Array<{
      customerId: string;
      name: string;
      creditLimit: string;
      openDebt: string;
      usagePercent: number;
      phone: string | null;
    }>;
  };
  customers: Array<{ id: string; name: string; phone: string | null }>;
  permissions: { canReceive: boolean; canRenegotiate: boolean; canUpdateLimit: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = React.useState<"CARTEIRA" | "INADIMPLENCIA" | "LIMITES" | "RENEGOCIACOES">("CARTEIRA");
  const [search, setSearch] = React.useState("");
  const [customerFilter, setCustomerFilter] = React.useState("");

  const [receiveTarget, setReceiveTarget] = React.useState<OpenInstallment | null>(null);
  const [charges, setCharges] = React.useState<{ penalty: string; interest: string; total: string; daysLate: number; outstanding: string } | null>(null);
  const [receiveAmount, setReceiveAmount] = React.useState(0);
  const [receiveMethod, setReceiveMethod] = React.useState("CASH");
  const [applyCharges, setApplyCharges] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [renegOpen, setRenegOpen] = React.useState(false);
  const [renegCustomer, setRenegCustomer] = React.useState<Delinquent | null>(null);
  const [renegSelected, setRenegSelected] = React.useState<string[]>([]);
  const [renegInstallments, setRenegInstallments] = React.useState(3);
  const [renegFirstDue, setRenegFirstDue] = React.useState(today);
  const [renegNotes, setRenegNotes] = React.useState("");

  const [limitTarget, setLimitTarget] = React.useState<{ customerId: string; name: string; creditLimit: string } | null>(null);
  const [newLimit, setNewLimit] = React.useState(0);
  const [limitReason, setLimitReason] = React.useState("");

  async function openReceive(installment: OpenInstallment) {
    setReceiveTarget(installment);
    setCharges(null);
    setApplyCharges(true);
    setReceiveMethod("CASH");
    setReceiveAmount(Number(installment.amount) - Number(installment.paidAmount));
    try {
      const result = await api.get<{ penalty: string; interest: string; total: string; daysLate: number; outstanding: string }>(
        `/api/finance/receivables/${installment.id}/charges`,
      );
      setCharges(result);
      setReceiveAmount(Number(result.total));
      setApplyCharges(result.daysLate > 0);
    } catch {
      // sem encargos calculáveis — mantém valor original
    }
  }

  async function submitReceive() {
    if (!receiveTarget) return;
    if (receiveAmount <= 0) return toast.error("Informe um valor maior que zero.");
    setSaving(true);
    try {
      await api.post(`/api/finance/receivables/${receiveTarget.id}/receive`, {
        amount: receiveAmount,
        method: receiveMethod,
        applyCharges,
      });
      toast.success("Recebimento registrado no crediário.");
      setReceiveTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function openRenegotiate(delinquent: Delinquent) {
    setRenegCustomer(delinquent);
    setRenegOpen(true);
    setRenegSelected([]);
    setRenegInstallments(3);
    setRenegFirstDue(today);
    setRenegNotes("");
  }

  const customerInstallments = React.useMemo(
    () => (renegCustomer ? data.installments.filter((i) => i.customerId === renegCustomer.customerId) : []),
    [data.installments, renegCustomer],
  );

  const renegTotal = customerInstallments
    .filter((i) => renegSelected.includes(i.id))
    .reduce((acc, i) => acc + (Number(i.amount) - Number(i.paidAmount)), 0);

  async function submitRenegotiate() {
    if (!renegCustomer) return;
    if (!renegSelected.length) return toast.error("Selecione as parcelas a renegociar.");
    setSaving(true);
    try {
      await api.post("/api/credit/renegotiations", {
        customerId: renegCustomer.customerId,
        receivableIds: renegSelected,
        installments: renegInstallments,
        firstDueDate: renegFirstDue,
        notes: renegNotes || undefined,
      });
      toast.success(`Dívida de ${brl(renegTotal)} renegociada em ${renegInstallments}x.`);
      setRenegOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitLimit() {
    if (!limitTarget) return;
    if (newLimit < 0) return toast.error("Limite inválido.");
    setSaving(true);
    try {
      await api.patch("/api/credit/limits", {
        customerId: limitTarget.customerId,
        creditLimit: newLimit,
        reason: limitReason || undefined,
      });
      toast.success("Limite de crédito atualizado.");
      setLimitTarget(null);
      setLimitReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const filteredInstallments = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.installments.filter((i) => {
      if (customerFilter && i.customerId !== customerFilter) return false;
      if (!q) return true;
      return (
        (i.customerName ?? "").toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q) ||
        String(i.saleNumber ?? "").includes(q)
      );
    });
  }, [data.installments, search, customerFilter]);

  const installmentsColumns: Column<OpenInstallment>[] = [
    {
      key: "customer",
      header: "Cliente",
      sortable: true,
      sortValue: (i) => i.customerName ?? "",
      cell: (i) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{i.customerName ?? "Consumidor final"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {i.saleNumber ? `Venda #${i.saleNumber}` : i.description}
            {i.installmentTotal && i.installmentTotal > 1 ? ` · ${i.installmentNumber}/${i.installmentTotal}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "due",
      header: "Vencimento",
      sortable: true,
      sortValue: (i) => i.dueDate,
      cell: (i) => {
        const overdue = i.dueDate < today;
        const days = overdue
          ? Math.floor((new Date(today).getTime() - new Date(i.dueDate).getTime()) / 86_400_000)
          : 0;
        return (
          <div>
            <span className={cn("whitespace-nowrap text-[11px]", overdue && "font-semibold text-[var(--danger)]")}>
              {dateBR(i.dueDate)}
            </span>
            {overdue && <p className="text-[9px] text-[var(--danger)]">{days} dia(s) em atraso</p>}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      sortable: true,
      sortValue: (i) => Number(i.amount),
      cell: (i) => <span className="text-[11px] tabular-nums">{brl(i.amount)}</span>,
    },
    {
      key: "open",
      header: "Saldo",
      align: "right",
      cell: (i) => (
        <span className="text-[12px] font-semibold tabular-nums">{brl(Number(i.amount) - Number(i.paidAmount))}</span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (i) => (
        <Badge tone={i.dueDate < today ? "danger" : i.status === "PARTIAL" ? "info" : "warning"}>
          {i.dueDate < today ? "Vencida" : i.status === "PARTIAL" ? "Parcial" : "A vencer"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (i) => (
        <div className="flex justify-end gap-0.5">
          {permissions.canReceive && (
            <Button variant="ghost" size="icon-sm" className="text-[var(--success)]" title="Receber" onClick={() => void openReceive(i)}>
              <HandCoins className="h-3.5 w-3.5" />
            </Button>
          )}
          {permissions.canRenegotiate && i.customerId && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Renegociar dívida do cliente"
              onClick={() =>
                void openRenegotiate({
                  customerId: i.customerId as string,
                  customerName: i.customerName,
                  customerPhone: null,
                  total: i.amount,
                  installments: 1,
                  oldestDue: i.dueDate,
                })
              }
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const delinquencyColumns: Column<Delinquent>[] = [
    {
      key: "customer",
      header: "Cliente",
      sortable: true,
      sortValue: (d) => d.customerName ?? "",
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{d.customerName ?? "—"}</p>
          {d.customerPhone && (
            <p className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Phone className="h-2.5 w-2.5" /> {d.customerPhone}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "oldest",
      header: "Vencido desde",
      sortable: true,
      sortValue: (d) => d.oldestDue,
      cell: (d) => <span className="text-[11px] text-[var(--danger)]">{dateBR(d.oldestDue)}</span>,
    },
    {
      key: "installments",
      header: "Parcelas",
      align: "right",
      cell: (d) => <span className="text-[11px] tabular-nums">{d.installments}</span>,
    },
    {
      key: "total",
      header: "Em atraso",
      align: "right",
      sortable: true,
      sortValue: (d) => Number(d.total),
      cell: (d) => <span className="text-[12px] font-bold tabular-nums text-[var(--danger)]">{brl(d.total)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <div className="flex justify-end gap-0.5">
          {d.customerPhone && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Cobrar pelo WhatsApp"
              onClick={() => {
                const text = encodeURIComponent(
                  `Olá ${d.customerName ?? ""}, tudo bem? Identificamos ${d.installments} parcela(s) em aberto totalizando ${brl(d.total)} desde ${dateBR(d.oldestDue)}. Podemos ajudar a regularizar?`,
                );
                window.open(`https://wa.me/55${(d.customerPhone ?? "").replace(/\D/g, "")}?text=${text}`, "_blank");
              }}
            >
              <Phone className="h-3.5 w-3.5 text-[var(--success)]" />
            </Button>
          )}
          {permissions.canRenegotiate && (
            <Button variant="ghost" size="icon-sm" title="Renegociar" onClick={() => void openRenegotiate(d)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const limitColumns: Column<(typeof data.creditUsage)[number]>[] = [
    {
      key: "customer",
      header: "Cliente",
      sortable: true,
      sortValue: (c) => c.name,
      cell: (c) => <span className="truncate text-[13px] font-semibold">{c.name}</span>,
    },
    {
      key: "limit",
      header: "Limite",
      align: "right",
      sortable: true,
      sortValue: (c) => Number(c.creditLimit),
      cell: (c) => <span className="text-[11px] tabular-nums">{brl(c.creditLimit)}</span>,
    },
    {
      key: "debt",
      header: "Em aberto",
      align: "right",
      cell: (c) => <span className="text-[11px] tabular-nums">{brl(c.openDebt)}</span>,
    },
    {
      key: "usage",
      header: "Uso do limite",
      cell: (c) => (
        <div className="min-w-[120px]">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div
              className={cn(
                "h-full rounded-full",
                c.usagePercent >= 100 ? "bg-[var(--danger)]" : c.usagePercent >= 80 ? "bg-[var(--warning)]" : "bg-[var(--success)]",
              )}
              style={{ width: `${Math.min(100, c.usagePercent)}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{c.usagePercent.toFixed(0)}% utilizado</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) =>
        permissions.canUpdateLimit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Alterar limite"
            onClick={() => {
              setLimitTarget({ customerId: c.customerId, name: c.name, creditLimit: c.creditLimit });
              setNewLimit(Number(c.creditLimit));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Crediário</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Carteira de {brl(data.totals.totalOpen)} · vencido{" "}
            <strong className="text-[var(--danger)]">{brl(data.totals.totalOverdue)}</strong> ·{" "}
            {num(data.totals.pendingCount)} parcela(s) em aberto
          </p>
        </div>
        {permissions.canExport && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() =>
              void downloadFile("/api/reports/finance/export", {
                kind: "receivables",
                format: "csv",
                from: "2000-01-01",
                to: today,
              }).catch((e) => toast.error(errorMessage(e)))
            }
          >
            Exportar carteira
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "A receber (total)", value: brl(data.totals.totalOpen), icon: Wallet, tone: "text-[var(--accent-strong)]" },
          { label: "Em atraso", value: brl(data.totals.totalOverdue), icon: AlertTriangle, tone: "text-[var(--danger)]" },
          { label: "A vencer", value: brl(data.totals.totalUpcoming), icon: TrendingUp, tone: "text-[var(--info)]" },
          { label: "Clientes inadimplentes", value: num(data.delinquents.length), icon: Users, tone: "text-[var(--warning)]" },
        ].map((k) => (
          <Card key={k.label} className="flex items-center gap-3 p-3">
            <div className={cn("rounded-lg bg-[var(--bg-muted)] p-2", k.tone)}>
              <k.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{k.label}</p>
              <p className="truncate text-sm font-bold tabular-nums">{k.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Alert tone="info" title="Encargos por atraso configurados">
        Multa de {data.settings.penalty}% sobre o saldo, juros de {data.settings.dailyInterest}% ao dia após{" "}
        {data.settings.graceDays} dia(s) de carência. Ajuste em Configurações → Crediário.
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "CARTEIRA" as const, label: "Carteira", count: data.installments.length, icon: CreditCard },
          { key: "INADIMPLENCIA" as const, label: "Inadimplência", count: data.delinquents.length, icon: AlertTriangle },
          { key: "LIMITES" as const, label: "Limites de crédito", count: data.creditUsage.length, icon: ShieldCheck },
          { key: "RENEGOCIACOES" as const, label: "Renegociações", count: data.renegotiations.length, icon: History },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.key
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            <span className="rounded-full bg-[var(--bg-muted)] px-1.5 text-[10px]">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "CARTEIRA" && (
        <>
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Buscar" className="min-w-[200px] flex-1">
                <SearchInput value={search} onChange={setSearch} placeholder="Cliente, venda ou descrição..." />
              </Field>
              <Field label="Cliente" className="w-56">
                <Select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
                  <option value="">Todos</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
          <DataTable
            data={filteredInstallments}
            columns={installmentsColumns}
            keyExtractor={(i) => i.id}
            emptyState={
              <EmptyState
                icon={<CreditCard className="h-6 w-6" />}
                title="Nenhuma parcela em aberto"
                description="As vendas no crediário geram parcelas automaticamente no PDV."
              />
            }
          />
        </>
      )}

      {tab === "INADIMPLENCIA" && (
        <DataTable
          data={data.delinquents}
          columns={delinquencyColumns}
          keyExtractor={(d) => d.customerId}
          emptyState={
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Nenhum cliente inadimplente"
              description="Nenhuma parcela vencida na carteira."
            />
          }
        />
      )}

      {tab === "LIMITES" && (
        <DataTable
          data={data.creditUsage}
          columns={limitColumns}
          keyExtractor={(c) => c.customerId}
          emptyState={<EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Sem limites definidos" description="Cadastre limites de crédito para os clientes." />}
        />
      )}

      {tab === "RENEGOCIACOES" && (
        <Card className="overflow-hidden">
          {data.renegotiations.length === 0 ? (
            <EmptyState
              icon={<History className="h-6 w-6" />}
              title="Nenhuma renegociação"
              description="Renegocie dívidas vencidas gerando novas parcelas com histórico preservado."
            />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {data.renegotiations.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <RefreshCw className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{r.customerName ?? "—"}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {dateBR(r.createdAt.slice(0, 10))} · {r.userName ?? "sistema"} · 1º venc. {dateBR(r.firstDueDate)}
                    </p>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] line-through">{brl(r.originalAmount)}</span>
                  <span className="text-[13px] font-bold tabular-nums">{brl(r.newAmount)}</span>
                  <Badge tone="info">{r.installments}x</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ---------------- receber ---------------- */}
      <Modal
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title="Receber parcela"
        description={receiveTarget?.customerName ?? undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReceiveTarget(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void submitReceive()}>Confirmar recebimento</Button>
          </>
        }
      >
        {receiveTarget && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Parcela</span>
                <span className="font-semibold tabular-nums">
                  {brl(receiveTarget.amount)}
                  {receiveTarget.installmentTotal && receiveTarget.installmentTotal > 1
                    ? ` · ${receiveTarget.installmentNumber}/${receiveTarget.installmentTotal}`
                    : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Vencimento</span>
                <span className="font-semibold">{dateBR(receiveTarget.dueDate)}</span>
              </div>
              {charges && charges.daysLate > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Multa + juros</span>
                    <span className="font-semibold tabular-nums text-[var(--danger)]">
                      {brl(Number(charges.penalty) + Number(charges.interest))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--border-default)] pt-1 font-bold">
                    <span>Total atualizado</span>
                    <span className="tabular-nums">{brl(charges.total)}</span>
                  </div>
                </>
              )}
            </div>
            {charges && charges.daysLate > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={applyCharges}
                  onChange={(e) => {
                    setApplyCharges(e.target.checked);
                    setReceiveAmount(e.target.checked ? Number(charges.total) : Number(charges.outstanding));
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Aplicar multa e juros ({charges.daysLate} dia(s) de atraso)
              </label>
            )}
            <Field label="Valor recebido">
              <MoneyInput value={receiveAmount} onChange={setReceiveAmount} />
            </Field>
            <Field label="Forma de pagamento">
              <Select value={receiveMethod} onChange={(e) => setReceiveMethod(e.target.value)}>
                <option value="CASH">Dinheiro</option>
                <option value="PIX">Pix</option>
                <option value="DEBIT">Débito</option>
                <option value="CREDIT">Crédito</option>
                <option value="TRANSFER">Transferência</option>
              </Select>
            </Field>
            <p className="text-[11px] text-[var(--text-muted)]">
              Recebimentos em dinheiro entram no caixa aberto do seu usuário; as demais formas ficam registradas no
              histórico financeiro.
            </p>
          </div>
        )}
      </Modal>

      {/* ---------------- renegociar ---------------- */}
      <Modal
        open={renegOpen}
        onClose={() => setRenegOpen(false)}
        title="Renegociar dívida"
        description={renegCustomer?.customerName ?? undefined}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRenegOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void submitRenegotiate()}>Confirmar renegociação</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning" title="Como funciona">
            As parcelas selecionadas são marcadas como renegociadas (não são apagadas) e novas parcelas são geradas com
            multa e juros incorporados ao saldo.
          </Alert>

          <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border-default)]">
            {customerInstallments.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--text-muted)]">Nenhuma parcela em aberto para este cliente.</p>
            ) : (
              customerInstallments.map((i) => (
                <label key={i.id} className="flex cursor-pointer items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 last:border-0 hover:bg-[var(--bg-muted)]">
                  <input
                    type="checkbox"
                    checked={renegSelected.includes(i.id)}
                    onChange={(e) =>
                      setRenegSelected((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{i.description ?? "Parcela"}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Venc. {dateBR(i.dueDate)}</p>
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums">{brl(Number(i.amount) - Number(i.paidAmount))}</span>
                </label>
              ))
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Parcelas">
              <Input
                type="number"
                min={1}
                max={48}
                value={renegInstallments}
                onChange={(e) => setRenegInstallments(Number(e.target.value))}
              />
            </Field>
            <Field label="1º vencimento">
              <Input type="date" value={renegFirstDue} onChange={(e) => setRenegFirstDue(e.target.value)} />
            </Field>
          </div>

          <Field label="Observações">
            <Input value={renegNotes} onChange={(e) => setRenegNotes(e.target.value)} placeholder="Acordo firmado com o cliente..." />
          </Field>

          <div className="rounded-lg bg-[var(--bg-muted)] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Saldo selecionado</span>
              <span className="font-semibold tabular-nums">{brl(renegTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--border-default)] pt-1 font-bold">
              <span>Nova parcela ({renegInstallments}x)</span>
              <span className="tabular-nums">{brl(renegInstallments > 0 ? renegTotal / renegInstallments : 0)}</span>
            </div>
            {renegTotal > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Percent className="h-2.5 w-2.5" /> Multa e juros calculados no servidor ao confirmar.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* ---------------- limite ---------------- */}
      <Modal
        open={Boolean(limitTarget)}
        onClose={() => setLimitTarget(null)}
        title="Alterar limite de crédito"
        description={limitTarget?.name}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLimitTarget(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void submitLimit()}>Salvar limite</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Limite atual">
            <Input value={brl(limitTarget?.creditLimit ?? 0)} disabled />
          </Field>
          <Field label="Novo limite" required>
            <MoneyInput value={newLimit} onChange={setNewLimit} />
          </Field>
          <Field label="Justificativa">
            <Input value={limitReason} onChange={(e) => setLimitReason(e.target.value)} placeholder="Ex.: aumento por histórico de pagamentos" />
          </Field>
          <p className="text-[11px] text-[var(--text-muted)]">
            A alteração fica registrada na auditoria com valor anterior e novo valor.
          </p>
        </div>
      </Modal>
    </div>
  );
}
