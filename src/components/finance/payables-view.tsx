"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Ban, AlertTriangle, Wallet, Calendar, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput, Textarea } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PAYABLE_STATUS, PAYMENT_METHODS } from "@/lib/constants";

type Payable = {
  id: string;
  description: string;
  amount: string;
  paidAmount: string;
  dueDate: string;
  status: string;
  documentNumber: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  notes: string | null;
};

export function PayablesView({
  initial,
  filters,
  categories,
  suppliers,
  accounts,
  permissions,
}: {
  initial: { items: Payable[]; total: number; totals: { count: number; total: string; open: string }; page: number; pageSize: number };
  filters: { status: string; from: string; to: string; search: string };
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; legalName: string }>;
  accounts: Array<{ id: string; name: string }>;
  permissions: { canCreate: boolean; canPay: boolean; canCancel: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = React.useState(filters.search);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [payTarget, setPayTarget] = React.useState<Payable | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<Payable | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    description: "",
    amount: 0,
    dueDate: today,
    categoryId: "",
    supplierId: "",
    documentNumber: "",
    installments: 1,
    notes: "",
  });
  const [payAmount, setPayAmount] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState("CASH");
  const [payAccountId, setPayAccountId] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");

  function applyFilters(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "" && value !== "ALL" && key !== "search") {
        next.set(key, String(value));
      }
    }
    if (search) next.set("search", search);
    router.push(`/financeiro/contas-a-pagar?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) applyFilters({ search });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreate() {
    if (!form.description.trim()) return toast.error("Informe a descrição.");
    if (form.amount <= 0) return toast.error("Informe o valor.");
    setSaving(true);
    try {
      await api.post("/api/finance/payables", {
        ...form,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        documentNumber: form.documentNumber || null,
        notes: form.notes || null,
      });
      toast.success(
        form.installments > 1
          ? `Conta criada em ${form.installments} parcelas.`
          : "Conta a pagar registrada.",
      );
      setCreateOpen(false);
      setForm({ description: "", amount: 0, dueDate: today, categoryId: "", supplierId: "", documentNumber: "", installments: 1, notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePay() {
    if (!payTarget) return;
    const remaining = Number(payTarget.amount) - Number(payTarget.paidAmount);
    if (payAmount <= 0) return toast.error("Informe o valor pago.");
    if (payAmount > remaining + 0.005) return toast.error(`O valor excede o saldo devedor de ${brl(remaining)}.`);
    setSaving(true);
    try {
      await api.post(`/api/finance/payables/${payTarget.id}/pay`, {
        amount: payAmount,
        method: payMethod,
        bankAccountId: payAccountId || null,
      });
      toast.success("Pagamento registrado.");
      setPayTarget(null);
      setPayAmount(0);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) return toast.error("Informe o motivo do cancelamento.");
    setSaving(true);
    try {
      await api.post(`/api/finance/payables/${cancelTarget.id}/cancel`, { reason: cancelReason });
      toast.success("Conta cancelada (o registro é preservado no histórico).");
      setCancelTarget(null);
      setCancelReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Payable>[] = [
    {
      key: "description",
      header: "Descrição",
      sortable: true,
      sortValue: (p) => p.description,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{p.description}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {p.documentNumber ? `Doc. ${p.documentNumber}` : "Sem documento"}
            {p.installmentTotal && p.installmentTotal > 1 ? ` · ${p.installmentNumber}/${p.installmentTotal}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "dueDate",
      header: "Vencimento",
      sortable: true,
      sortValue: (p) => p.dueDate,
      cell: (p) => {
        const overdue = p.dueDate < today && ["PENDING", "PARTIAL"].includes(p.status);
        return (
          <span className={cn("whitespace-nowrap text-[11px]", overdue && "font-semibold text-[var(--danger)]")}>
            {dateBR(p.dueDate)}
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
      sortValue: (p) => Number(p.amount),
      cell: (p) => <span className="text-[11px] tabular-nums">{brl(p.amount)}</span>,
    },
    {
      key: "paid",
      header: "Pago",
      align: "right",
      hiddenOnMobile: true,
      cell: (p) => <span className="text-[11px] tabular-nums text-[var(--success)]">{brl(p.paidAmount)}</span>,
    },
    {
      key: "open",
      header: "Saldo",
      align: "right",
      cell: (p) => (
        <span className="text-xs font-semibold tabular-nums">
          {brl(Number(p.amount) - Number(p.paidAmount))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (p) => {
        const cfg = PAYABLE_STATUS[p.status];
        return <Badge tone={(cfg?.tone as "success" | "warning" | "danger" | "info" | "neutral") ?? "neutral"}>{cfg?.label ?? p.status}</Badge>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-0.5">
          {permissions.canPay && ["PENDING", "PARTIAL"].includes(p.status) && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Registrar pagamento"
              className="text-[var(--success)]"
              onClick={() => {
                setPayTarget(p);
                setPayAmount(Number(p.amount) - Number(p.paidAmount));
              }}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          {permissions.canCancel && p.status !== "PAID" && p.status !== "CANCELED" && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Cancelar conta"
              className="text-[var(--danger)]"
              onClick={() => setCancelTarget(p)}
            >
              <Ban className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Contas a pagar
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(initial.totals.count)} lançamento(s) · total {brl(initial.totals.total)} · em aberto{" "}
            <strong className="text-[var(--danger)]">{brl(initial.totals.open)}</strong>
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
                  kind: "payables",
                  format: "csv",
                  from: filters.from,
                  to: filters.to,
                }).catch((e) => toast.error(errorMessage(e)))
              }
            >
              Exportar
            </Button>
          )}
          {permissions.canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
              Nova conta
            </Button>
          )}
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Situação" className="w-36">
            <Select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })}>
              <option value="ALL">Todas</option>
              <option value="PENDING">Pendentes</option>
              <option value="PARTIAL">Parciais</option>
              <option value="PAID">Pagas</option>
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
            <SearchInput value={search} onChange={setSearch} placeholder="Descrição ou documento..." />
          </Field>
        </div>
      </Card>

      <DataTable
        data={initial.items}
        columns={columns}
        keyExtractor={(p) => p.id}
        pagination={{
          page: initial.page,
          pageSize: initial.pageSize,
          total: initial.total,
          onPageChange: (page) => applyFilters({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="Nenhuma conta a pagar"
            description="Registre aluguel, energia, fornecedores e demais despesas para acompanhar o fluxo de caixa."
            action={permissions.canCreate ? <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Nova conta</Button> : undefined}
          />
        }
      />

      {/* Criar */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nova conta a pagar"
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleCreate()}>Registrar conta</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição" required className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Aluguel da loja, energia, fornecedor..." autoFocus />
          </Field>
          <Field label="Valor total" required>
            <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
          <Field label="1º vencimento" required>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label="Parcelas" hint="Gera contas mensais automaticamente">
            <Input
              type="number"
              min={1}
              max={60}
              value={form.installments}
              onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })}
            />
          </Field>
          <Field label="Categoria (DRE)">
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Selecione</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fornecedor">
            <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">Nenhum</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.legalName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Documento / NF">
            <Input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} placeholder="Nº da nota ou boleto" />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {form.installments > 1 && form.amount > 0 && (
            <div className="sm:col-span-2">
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-[11px] text-[var(--text-secondary)]">
                Serão criadas <strong>{form.installments} parcelas</strong> de aproximadamente{" "}
                <strong>{brl(form.amount / form.installments)}</strong>, com vencimentos mensais a partir de{" "}
                {dateBR(form.dueDate)}.
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Pagar */}
      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Registrar pagamento"
        description={payTarget?.description}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPayTarget(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handlePay()}>Confirmar pagamento</Button>
          </>
        }
      >
        {payTarget && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Valor da conta</span>
                <span className="font-semibold tabular-nums">{brl(payTarget.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Já pago</span>
                <span className="font-semibold tabular-nums">{brl(payTarget.paidAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border-default)] pt-1 font-bold">
                <span>Saldo devedor</span>
                <span className="tabular-nums">{brl(Number(payTarget.amount) - Number(payTarget.paidAmount))}</span>
              </div>
            </div>
            <Field label="Valor pago" required hint="Pagamentos parciais são permitidos">
              <MoneyInput value={payAmount} onChange={setPayAmount} />
            </Field>
            <Field label="Forma de pagamento">
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {PAYMENT_METHODS.filter((m) => m.value !== "STORE_CREDIT").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Conta de saída" hint="Opcional — atualiza o saldo da conta">
              <Select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
                <option value="">Não vincular</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            {payMethod === "CASH" && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Pagamentos em dinheiro são lançados automaticamente no caixa aberto do seu usuário.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Cancelar */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancelar conta a pagar"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button variant="danger" size="sm" loading={saving} onClick={() => void handleCancel()}>Cancelar conta</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            A conta <strong>{cancelTarget?.description}</strong> será cancelada. O registro permanece no
            histórico para fins de auditoria.
          </p>
          <Field label="Motivo" required>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex.: lançamento duplicado" autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
