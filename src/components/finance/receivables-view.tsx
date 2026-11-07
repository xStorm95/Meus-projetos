"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Calendar, CheckCircle2, Download, HandCoins, Info, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RECEIVABLE_STATUS, PAYMENT_METHODS } from "@/lib/constants";

type Receivable = {
  id: string;
  description: string | null;
  amount: string;
  paidAmount: string;
  penaltyAmount: string;
  interestAmount: string;
  dueDate: string;
  status: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  saleNumber: number | null;
};

type Charges = {
  outstanding: string;
  penalty: string;
  interest: string;
  daysLate: number;
  total: string;
};

export function ReceivablesView({
  initial,
  filters,
  accounts,
  permissions,
}: {
  initial: {
    items: Receivable[];
    total: number;
    totals: { count: number; total: string; open: string };
    page: number;
    pageSize: number;
  };
  filters: { status: string; from: string; to: string; overdueOnly: boolean };
  accounts: Array<{ id: string; name: string }>;
  permissions: { canReceive: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [target, setTarget] = React.useState<Receivable | null>(null);
  const [charges, setCharges] = React.useState<Charges | null>(null);
  const [loadingCharges, setLoadingCharges] = React.useState(false);
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState("CASH");
  const [accountId, setAccountId] = React.useState("");
  const [applyCharges, setApplyCharges] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [cancelTarget, setCancelTarget] = React.useState<Receivable | null>(null);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initial.items;
    return initial.items.filter(
      (r) =>
        (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        String(r.saleNumber ?? "").includes(q),
    );
  }, [initial.items, search]);

  function applyFilters(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined || value === false || value === "" || value === "ALL") continue;
      next.set(key, String(value));
    }
    router.push(`/financeiro/contas-a-receber?${next.toString()}`);
  }

  async function openReceive(r: Receivable) {
    setTarget(r);
    setCharges(null);
    setMethod("CASH");
    setAccountId("");
    setApplyCharges(true);
    setAmount(Number(r.amount) - Number(r.paidAmount));
    setLoadingCharges(true);
    try {
      const data = await api.get<Charges>(`/api/finance/receivables/${r.id}/charges`);
      setCharges(data);
      setAmount(Number(data.total));
      setApplyCharges(data.daysLate > 0);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingCharges(false);
    }
  }

  async function handleReceive() {
    if (!target) return;
    if (amount <= 0) return toast.error("Informe um valor maior que zero.");
    setSaving(true);
    try {
      await api.post(`/api/finance/receivables/${target.id}/receive`, {
        amount,
        method,
        bankAccountId: accountId || null,
        applyCharges,
      });
      toast.success("Recebimento registrado.");
      setTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Receivable>[] = [
    {
      key: "customer",
      header: "Cliente",
      sortable: true,
      sortValue: (r) => r.customerName ?? "",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{r.customerName ?? "Consumidor final"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {r.saleNumber ? `Venda #${r.saleNumber}` : r.description ?? "Parcela"}
            {r.installmentTotal && r.installmentTotal > 1 ? ` · ${r.installmentNumber}/${r.installmentTotal}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "dueDate",
      header: "Vencimento",
      sortable: true,
      sortValue: (r) => r.dueDate,
      cell: (r) => {
        const overdue = r.dueDate < today && ["PENDING", "PARTIAL", "OVERDUE"].includes(r.status);
        return (
          <span className={cn("whitespace-nowrap text-[11px]", overdue && "font-semibold text-[var(--danger)]")}>
            {dateBR(r.dueDate)}
            {overdue && <AlertTriangle className="ml-1 inline h-3 w-3" />}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.amount),
      cell: (r) => <span className="text-[11px] tabular-nums">{brl(r.amount)}</span>,
    },
    {
      key: "paid",
      header: "Recebido",
      align: "right",
      hiddenOnMobile: true,
      cell: (r) => <span className="text-[11px] tabular-nums text-[var(--success)]">{brl(r.paidAmount)}</span>,
    },
    {
      key: "open",
      header: "Saldo",
      align: "right",
      cell: (r) => (
        <span className="text-xs font-semibold tabular-nums">{brl(Number(r.amount) - Number(r.paidAmount))}</span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (r) => {
        const cfg = RECEIVABLE_STATUS[r.status];
        return (
          <Badge tone={(cfg?.tone as "success" | "warning" | "danger" | "info" | "neutral") ?? "neutral"}>
            {cfg?.label ?? r.status}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end">
          {permissions.canReceive && ["PENDING", "PARTIAL", "OVERDUE"].includes(r.status) && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Registrar recebimento"
              className="text-[var(--success)]"
              onClick={(e) => {
                e.stopPropagation();
                void openReceive(r);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const overdueTotal = initial.items
    .filter((r) => r.dueDate < today && ["PENDING", "PARTIAL", "OVERDUE"].includes(r.status))
    .reduce((acc, r) => acc + (Number(r.amount) - Number(r.paidAmount)), 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Contas a receber
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(initial.totals.count)} parcela(s) · total {brl(initial.totals.total)} · em aberto{" "}
            <strong className="text-[var(--warning)]">{brl(initial.totals.open)}</strong>
            {overdueTotal > 0 && (
              <>
                {" "}
                · vencido <strong className="text-[var(--danger)]">{brl(overdueTotal)}</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {permissions.canExport && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={() =>
                void downloadFile("/api/reports/finance/export", {
                  kind: "receivables",
                  format: "csv",
                  from: filters.from,
                  to: filters.to,
                }).catch((e) => toast.error(errorMessage(e)))
              }
            >
              Exportar
            </Button>
          )}
          <Button
            variant={filters.overdueOnly ? "primary" : "outline"}
            size="sm"
            leftIcon={<AlertTriangle className="h-3.5 w-3.5" />}
            onClick={() => applyFilters({ overdueOnly: filters.overdueOnly ? undefined : "true" })}
          >
            Somente vencidas
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Situação" className="w-36">
            <Select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })}>
              <option value="ALL">Todas</option>
              <option value="PENDING">Pendentes</option>
              <option value="PARTIAL">Parciais</option>
              <option value="OVERDUE">Vencidas</option>
              <option value="PAID">Recebidas</option>
              <option value="CANCELED">Canceladas</option>
            </Select>
          </Field>
          <Field label="Vencimento de" className="w-36">
            <Input type="date" value={filters.from} onChange={(e) => applyFilters({ from: e.target.value })} />
          </Field>
          <Field label="até" className="w-36">
            <Input type="date" value={filters.to} onChange={(e) => applyFilters({ to: e.target.value })} />
          </Field>
          <Field label="Buscar" className="min-w-[200px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Cliente ou venda..." />
          </Field>
        </div>
      </Card>

      <DataTable
        data={visible}
        columns={columns}
        keyExtractor={(r) => r.id}
        pagination={{
          page: initial.page,
          pageSize: initial.pageSize,
          total: initial.total,
          onPageChange: (page) => applyFilters({ page: String(page) }),
        }}
        emptyState={
          <EmptyState
            icon={<HandCoins className="h-6 w-6" />}
            title="Nenhuma conta a receber"
            description="As parcelas de crediário geradas no PDV aparecem aqui automaticamente."
          />
        }
      />

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Registrar recebimento"
        description={target?.customerName ?? undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={() => void handleReceive()}>
              Confirmar recebimento
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Parcela</span>
                <span className="font-semibold">
                  {brl(target.amount)}
                  {target.installmentTotal && target.installmentTotal > 1
                    ? ` · ${target.installmentNumber}/${target.installmentTotal}`
                    : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Vencimento</span>
                <span className="font-semibold">{dateBR(target.dueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Já recebido</span>
                <span className="font-semibold tabular-nums">{brl(target.paidAmount)}</span>
              </div>
            </div>

            {loadingCharges && <p className="text-[11px] text-[var(--text-muted)]">Calculando encargos...</p>}

            {charges && charges.daysLate > 0 && (
              <Alert tone="warning" title={`${charges.daysLate} dia(s) em atraso`}>
                <div className="mt-1 space-y-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span>Multa</span>
                    <span className="tabular-nums">{brl(charges.penalty)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Juros</span>
                    <span className="tabular-nums">{brl(charges.interest)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--border-default)] pt-0.5 font-semibold">
                    <span>Total atualizado</span>
                    <span className="tabular-nums">{brl(charges.total)}</span>
                  </div>
                </div>
              </Alert>
            )}

            {charges && charges.daysLate > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={applyCharges}
                  onChange={(e) => {
                    setApplyCharges(e.target.checked);
                    const outstanding = Number(target.amount) - Number(target.paidAmount);
                    setAmount(e.target.checked ? Number(charges.total) : outstanding);
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Aplicar multa e juros ao recebimento
              </label>
            )}

            <Field label="Valor recebido" required hint="Recebimentos parciais são permitidos">
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
            <Field label="Forma de pagamento">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.filter((m) => m.value !== "STORE_CREDIT").map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Conta de entrada" hint="Opcional — atualiza o saldo da conta">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Não vincular</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {method === "CASH" && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Recebimentos em dinheiro entram automaticamente no caixa aberto do seu usuário.
              </p>
            )}
            {target.customerPhone && (
              <p className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Info className="h-3 w-3" /> Telefone do cliente: {target.customerPhone}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Parcela não pode ser excluída"
        size="sm"
        footer={
          <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>
            Entendi
          </Button>
        }
      >
        <p className="text-xs text-[var(--text-secondary)]">
          Parcelas de crediário são registros financeiros e não podem ser apagados. Para encerrar a dívida use{" "}
          <strong>renegociação</strong> (Crediário), que gera novas parcelas preservando o histórico.
        </p>
      </Modal>
    </div>
  );
}
