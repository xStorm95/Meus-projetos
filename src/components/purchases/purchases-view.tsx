"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus, ClipboardList, Truck, Trash2, Check, Ban, PackageCheck, Printer, AlertTriangle,
  Sparkles, Receipt, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateBR, dateTimeBR, num, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput, Textarea } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { VariantPicker, type VariantOption } from "@/components/stock/variant-picker";

type Order = {
  id: string;
  code: string;
  supplierId: string;
  status: string;
  issueDate: string;
  expectedDate: string | null;
  total: string;
  subtotal: string;
  discountAmount: string;
  freightAmount: string;
  installments: number;
  firstDueDate: string | null;
  notes: string | null;
  receivedAt: string | null;
  supplierName: string | null;
  userName: string | null;
  itemCount: number;
  pendingQty: string;
};

type OrderDetail = Order & {
  supplierDocument: string | null;
  items: Array<{
    id: string;
    variantId: string | null;
    productId: string | null;
    description: string;
    sku: string | null;
    quantity: string;
    receivedQty: string;
    unitCost: string;
    total: string;
    colorName: string | null;
    sizeName: string | null;
    stockQty: string | null;
  }>;
  payables: Array<{
    id: string;
    description: string;
    amount: string;
    paidAmount: string;
    dueDate: string;
    status: string;
    installmentNumber: number | null;
    installmentTotal: number | null;
  }>;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  QUOTATION: { label: "Cotação", tone: "info" },
  ORDERED: { label: "Pedido enviado", tone: "warning" },
  PARTIAL: { label: "Parcialmente recebido", tone: "info" },
  RECEIVED: { label: "Recebido", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "danger" },
};

type DraftItem = { variant: VariantOption | null; description: string; sku: string | null; quantity: number; unitCost: number };

export function PurchasesView({
  data,
  filters,
  suppliers,
  categories,
  permissions,
}: {
  data: {
    items: Order[];
    total: number;
    totals: { total: string; open: string };
    page: number;
    pageSize: number;
  };
  filters: { status: string; search: string; from: string; to: string; supplierId: string };
  suppliers: Array<{ id: string; legalName: string }>;
  categories: Array<{ id: string; name: string }>;
  permissions: { canManage: boolean };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState(filters.search);
  const [detail, setDetail] = React.useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // novo pedido
  const [form, setForm] = React.useState({
    supplierId: "",
    issueDate: todayISO(),
    expectedDate: "",
    installments: 1,
    firstDueDate: todayISO(),
    discountAmount: 0,
    freightAmount: 0,
    notes: "",
  });
  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [suggestions, setSuggestions] = React.useState<
    Array<{ variantId: string; name: string; sku: string; colorName: string | null; sizeName: string | null; stockQty: string; suggested: number; costPrice: string }>
  >([]);

  // recebimento
  const [receiveQty, setReceiveQty] = React.useState<Record<string, number>>({});
  const [receiveCost, setReceiveCost] = React.useState<Record<string, number>>({});
  const [generatePayables, setGeneratePayables] = React.useState(true);
  const [installments, setInstallments] = React.useState(1);
  const [firstDueDate, setFirstDueDate] = React.useState(todayISO());
  const [cancelReason, setCancelReason] = React.useState("");

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "ALL") continue;
      next.set(k, String(v));
    }
    router.push(`/compras?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) navigate({ search, page: undefined });
    }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  React.useEffect(() => {
    if (!form.supplierId) {
      setSuggestions([]);
      return;
    }
    let active = true;
    api
      .get<{ suggestions: typeof suggestions }>("/api/purchases/suggestions", { supplierId: form.supplierId })
      .then((r) => active && setSuggestions(r.suggestions ?? []))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [form.supplierId]);

  const subtotal = items.reduce((acc, i) => acc + i.quantity * i.unitCost, 0);
  const total = subtotal - form.discountAmount + form.freightAmount;

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const result = await api.get<OrderDetail>(`/api/purchases/${id}`);
      setDetail(result);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitOrder(status: "DRAFT" | "ORDERED" | "QUOTATION") {
    if (!form.supplierId) return toast.error("Selecione o fornecedor.");
    if (!items.length) return toast.error("Adicione ao menos um item.");
    setSaving(true);
    try {
      const created = await api.post<{ order: { id: string; code: string } }>("/api/purchases", {
        supplierId: form.supplierId,
        issueDate: form.issueDate,
        expectedDate: form.expectedDate || null,
        installments: form.installments,
        firstDueDate: form.firstDueDate || null,
        discountAmount: form.discountAmount,
        freightAmount: form.freightAmount,
        notes: form.notes || null,
        items: items.map((i) => ({
          variantId: i.variant?.variantId ?? null,
          description: i.description,
          sku: i.sku,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      });
      if (status !== "DRAFT") {
        await api.patch(`/api/purchases/${created.order.id}`, { status });
      }
      toast.success(
        status === "ORDERED"
          ? `Pedido ${created.order.code} enviado ao fornecedor.`
          : status === "QUOTATION"
            ? `Cotação ${created.order.code} registrada.`
            : `Rascunho ${created.order.code} salvo.`,
      );
      setCreateOpen(false);
      setItems([]);
      setForm({
        supplierId: "",
        issueDate: todayISO(),
        expectedDate: "",
        installments: 1,
        firstDueDate: todayISO(),
        discountAmount: 0,
        freightAmount: 0,
        notes: "",
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function prepareReceive() {
    if (!detail) return;
    const qty: Record<string, number> = {};
    const cost: Record<string, number> = {};
    for (const item of detail.items) {
      qty[item.id] = Number(item.quantity) - Number(item.receivedQty);
      cost[item.id] = Number(item.unitCost);
    }
    setReceiveQty(qty);
    setReceiveCost(cost);
    setGeneratePayables(true);
    setInstallments(detail.installments || 1);
    setFirstDueDate(detail.firstDueDate || todayISO());
    setReceiveOpen(true);
  }

  async function submitReceive() {
    if (!detail) return;
    const payload = detail.items
      .map((item) => ({
        itemId: item.id,
        receivedQty: receiveQty[item.id] ?? 0,
        unitCost: receiveCost[item.id] ?? Number(item.unitCost),
      }))
      .filter((i) => i.receivedQty > 0);
    if (!payload.length) return toast.error("Informe a quantidade recebida de ao menos um item.");
    setSaving(true);
    try {
      const result = await api.post<{ payablesCreated: number; allReceived: boolean }>(
        `/api/purchases/${detail.id}/receive`,
        {
          items: payload,
          createPayables: generatePayables,
          firstDueDate: firstDueDate || undefined,
          installments,
        },
      );
      toast.success(
        result.allReceived
          ? `Pedido recebido. ${result.payablesCreated} conta(s) a pagar gerada(s).`
          : "Recebimento parcial registrado.",
      );
      setReceiveOpen(false);
      setDetail(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitCancel() {
    if (!detail) return;
    if (cancelReason.trim().length < 3) return toast.error("Informe o motivo do cancelamento.");
    setSaving(true);
    try {
      await api.post(`/api/purchases/${detail.id}/cancel`, { reason: cancelReason });
      toast.success("Pedido cancelado (histórico preservado).");
      setCancelOpen(false);
      setCancelReason("");
      setDetail(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: "ORDERED" | "QUOTATION" | "DRAFT") {
    try {
      await api.patch(`/api/purchases/${id}`, { status });
      toast.success("Status atualizado.");
      router.refresh();
      void openDetail(id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<Order>[] = [
    {
      key: "code",
      header: "Pedido",
      sortable: true,
      sortValue: (o) => o.code,
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{o.code}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {dateBR(o.issueDate)} · {o.itemCount} item(ns)
          </p>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Fornecedor",
      sortable: true,
      sortValue: (o) => o.supplierName ?? "",
      cell: (o) => (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Truck className="h-3 w-3 text-[var(--text-muted)]" />
          <span className="truncate">{o.supplierName ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "expected",
      header: "Previsão",
      hiddenOnMobile: true,
      cell: (o) => <span className="text-[11px]">{o.expectedDate ? dateBR(o.expectedDate) : "—"}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortValue: (o) => Number(o.total),
      cell: (o) => <span className="text-[12px] font-semibold tabular-nums">{brl(o.total)}</span>,
    },
    {
      key: "pending",
      header: "A receber",
      align: "right",
      hiddenOnMobile: true,
      cell: (o) => (
        <span className={cn("text-[11px] tabular-nums", Number(o.pendingQty) > 0 ? "text-[var(--warning)]" : "text-[var(--text-muted)]")}>
          {num(o.pendingQty)} un.
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (o) => {
        const cfg = STATUS[o.status] ?? { label: o.status, tone: "neutral" as const };
        return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (o) => (
        <Button variant="ghost" size="icon-sm" onClick={() => void openDetail(o.id)} title="Abrir pedido">
          <ChevronRight className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(data.total)} pedido(s) · total {brl(data.totals.total)} · em aberto{" "}
            <strong className="text-[var(--warning)]">{brl(data.totals.open)}</strong>
          </p>
        </div>
        {permissions.canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Novo pedido
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Situação" className="w-44">
            <Select value={filters.status} onChange={(e) => navigate({ status: e.target.value, page: undefined })}>
              <option value="ALL">Todos</option>
              {Object.entries(STATUS).map(([value, cfg]) => (
                <option key={value} value={value}>{cfg.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fornecedor" className="w-52">
            <Select value={filters.supplierId} onChange={(e) => navigate({ supplierId: e.target.value, page: undefined })}>
              <option value="">Todos</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.legalName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Emissão de" className="w-36">
            <Input type="date" value={filters.from} onChange={(e) => navigate({ from: e.target.value, page: undefined })} />
          </Field>
          <Field label="até" className="w-36">
            <Input type="date" value={filters.to} onChange={(e) => navigate({ to: e.target.value, page: undefined })} />
          </Field>
          <Field label="Buscar" className="min-w-[180px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Código do pedido ou fornecedor..." />
          </Field>
        </div>
      </Card>

      <DataTable
        data={data.items}
        columns={columns}
        keyExtractor={(o) => o.id}
        pagination={{
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onPageChange: (page) => navigate({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="Nenhum pedido de compra"
            description="Monte um pedido para o fornecedor. No recebimento o estoque e as contas a pagar são atualizados automaticamente."
            action={permissions.canManage ? <Button size="sm" onClick={() => setCreateOpen(true)}>Novo pedido</Button> : undefined}
          />
        }
      />

      {/* -------------------- novo pedido -------------------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo pedido de compra"
        description="Estoque e contas a pagar são gerados no recebimento"
        size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button variant="outline" size="sm" loading={saving} onClick={() => void submitOrder("QUOTATION")}>
              Salvar cotação
            </Button>
            <Button variant="outline" size="sm" loading={saving} onClick={() => void submitOrder("DRAFT")}>
              Salvar rascunho
            </Button>
            <Button size="sm" loading={saving} onClick={() => void submitOrder("ORDERED")} leftIcon={<Check className="h-4 w-4" />}>
              Enviar pedido
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Fornecedor" required className="sm:col-span-2">
              <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">Selecione</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.legalName}</option>
                ))}
              </Select>
            </Field>
            <Field label="Emissão" required>
              <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </Field>
            <Field label="Previsão de entrega">
              <Input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">Itens do pedido</p>
            <VariantPicker
              onSelect={(variant) => {
                const exists = items.findIndex((i) => i.variant?.variantId === variant.variantId);
                if (exists >= 0) {
                  setItems((prev) => prev.map((i, n) => (n === exists ? { ...i, quantity: i.quantity + 1 } : i)));
                  return;
                }
                setItems((prev) => [
                  ...prev,
                  {
                    variant,
                    description: `${variant.name}${variant.colorName ? ` ${variant.colorName}` : ""}${variant.sizeName ? ` ${variant.sizeName}` : ""}`,
                    sku: variant.sku,
                    quantity: 1,
                    unitCost: Number(variant.costPrice),
                  },
                ]);
              }}
              placeholder="Buscar produto para compor o pedido..."
            />

            {form.supplierId && suggestions.length > 0 && (
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/40 p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold">
                  <Sparkles className="h-3 w-3 text-[var(--accent)]" /> Sugestão de reposição deste fornecedor
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.slice(0, 10).map((s) => (
                    <button
                      key={s.variantId}
                      type="button"
                      onClick={() => {
                        if (items.some((i) => i.variant?.variantId === s.variantId)) return;
                        setItems((prev) => [
                          ...prev,
                          {
                            variant: null,
                            description: `${s.name}${s.colorName ? ` ${s.colorName}` : ""}${s.sizeName ? ` ${s.sizeName}` : ""}`,
                            sku: s.sku,
                            quantity: s.suggested,
                            unitCost: Number(s.costPrice),
                          },
                        ]);
                        toast.success(`${s.sku} adicionado (${s.suggested} un.).`);
                      }}
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] hover:border-[var(--accent)]"
                    >
                      {s.sku} · saldo {num(s.stockQty)} · +{s.suggested}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
                <table className="w-full text-[12px]">
                  <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-2 py-2 text-right">Qtd</th>
                      <th className="px-2 py-2 text-right">Custo un.</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={`${item.sku}-${idx}`} className="border-t border-[var(--border-subtle)]">
                        <td className="px-3 py-2">
                          <p className="font-semibold">{item.description}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{item.sku ?? "sem SKU"}</p>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            className="w-20 text-right"
                            onChange={(e) => setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, quantity: Number(e.target.value) } : i)))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <MoneyInput
                            value={item.unitCost}
                            className="w-28"
                            onChange={(v) => setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, unitCost: v } : i)))}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{brl(item.quantity * item.unitCost)}</td>
                        <td className="px-1 py-2">
                          <Button variant="ghost" size="icon-sm" onClick={() => setItems((prev) => prev.filter((_, n) => n !== idx))}>
                            <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Desconto (R$)">
              <MoneyInput value={form.discountAmount} onChange={(v) => setForm({ ...form, discountAmount: v })} />
            </Field>
            <Field label="Frete (R$)">
              <MoneyInput value={form.freightAmount} onChange={(v) => setForm({ ...form, freightAmount: v })} />
            </Field>
            <Field label="Parcelas" hint="Contas a pagar geradas no recebimento">
              <Input
                type="number"
                min={1}
                max={36}
                value={form.installments}
                onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })}
              />
            </Field>
            <Field label="1º vencimento">
              <Input type="date" value={form.firstDueDate} onChange={(e) => setForm({ ...form, firstDueDate: e.target.value })} />
            </Field>
          </div>

          <Field label="Observações">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg-muted)] px-3 py-2.5 text-xs">
            <span className="text-[var(--text-muted)]">
              Subtotal {brl(subtotal)} · desconto {brl(form.discountAmount)} · frete {brl(form.freightAmount)}
            </span>
            <span className="text-base font-bold tabular-nums">{brl(total)}</span>
          </div>
        </div>
      </Modal>

      {/* -------------------- detalhe -------------------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Pedido ${detail.code}` : "Pedido"}
        description={detail?.supplierName ?? undefined}
        size="xl"
        footer={
          detail && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.print()} leftIcon={<Printer className="h-4 w-4" />}>
                Imprimir
              </Button>
              {permissions.canManage && detail.status === "DRAFT" && (
                <Button variant="outline" size="sm" onClick={() => void changeStatus(detail.id, "ORDERED")}>
                  Enviar ao fornecedor
                </Button>
              )}
              {permissions.canManage && ["DRAFT", "QUOTATION", "ORDERED", "PARTIAL"].includes(detail.status) && (
                <Button variant="outline" size="sm" className="text-[var(--danger)]" onClick={() => setCancelOpen(true)} leftIcon={<Ban className="h-4 w-4" />}>
                  Cancelar
                </Button>
              )}
              {permissions.canManage && ["ORDERED", "PARTIAL"].includes(detail.status) && (
                <Button size="sm" onClick={prepareReceive} leftIcon={<PackageCheck className="h-4 w-4" />}>
                  Receber mercadoria
                </Button>
              )}
            </>
          )
        }
      >
        {detailLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Carregando pedido...</p>
        ) : detail ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { label: "Situação", value: STATUS[detail.status]?.label ?? detail.status },
                { label: "Emissão", value: dateBR(detail.issueDate) },
                { label: "Previsão", value: detail.expectedDate ? dateBR(detail.expectedDate) : "—" },
                { label: "Total", value: brl(detail.total) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-1.5">
                  <p className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{k.label}</p>
                  <p className="text-[12px] font-semibold">{k.value}</p>
                </div>
              ))}
            </div>

            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th className="py-1.5 text-left">Item</th>
                  <th className="py-1.5 text-right">Pedido</th>
                  <th className="py-1.5 text-right">Recebido</th>
                  <th className="py-1.5 text-right">Custo</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-1.5">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {item.sku}
                        {item.colorName ? ` · ${item.colorName}` : ""}
                        {item.sizeName ? ` · ${item.sizeName}` : ""}
                      </p>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{num(item.quantity)}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", Number(item.receivedQty) < Number(item.quantity) && "text-[var(--warning)]")}>
                      {num(item.receivedQty)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{brl(item.unitCost)}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{brl(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs">
              <span className="text-[var(--text-muted)]">
                {detail.installments}x · 1º venc. {detail.firstDueDate ? dateBR(detail.firstDueDate) : "—"}
              </span>
              <span className="text-base font-bold tabular-nums">{brl(detail.total)}</span>
            </div>

            {detail.receivedAt && (
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <PackageCheck className="h-3.5 w-3.5" /> Recebido em {dateTimeBR(detail.receivedAt)}
              </p>
            )}
            {detail.notes && <p className="text-[11px] text-[var(--text-secondary)]">{detail.notes}</p>}
          </div>
        ) : null}
      </Modal>

      {/* -------------------- recebimento -------------------- */}
      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receber mercadoria"
        description="Atualiza estoque, custos e gera contas a pagar"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReceiveOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void submitReceive()} leftIcon={<PackageCheck className="h-4 w-4" />}>
              Confirmar recebimento
            </Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-3">
            <Alert tone="info" title="O que acontece ao confirmar">
              Cada item recebido gera entrada no estoque (movimento de compra) e atualiza o custo da variação com
              histórico de preço. Ao completar o pedido, as contas a pagar são criadas automaticamente.
            </Alert>
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th className="py-1.5 text-left">Item</th>
                  <th className="py-1.5 text-right">Pendente</th>
                  <th className="py-1.5 text-right">Receber</th>
                  <th className="py-1.5 text-right">Custo un.</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => {
                  const pending = Number(item.quantity) - Number(item.receivedQty);
                  return (
                    <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                      <td className="py-1.5">
                        <p className="font-medium">{item.description}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{item.sku}</p>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{num(pending)}</td>
                      <td className="py-1.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={pending}
                          value={receiveQty[item.id] ?? 0}
                          disabled={pending <= 0}
                          className="w-20 text-right"
                          onChange={(e) => setReceiveQty((prev) => ({ ...prev, [item.id]: Math.min(pending, Number(e.target.value)) }))}
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <MoneyInput
                          value={receiveCost[item.id] ?? Number(item.unitCost)}
                          disabled={pending <= 0}
                          className="w-28"
                          onChange={(v) => setReceiveCost((prev) => ({ ...prev, [item.id]: v }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={generatePayables}
                  onChange={(e) => setGeneratePayables(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Gerar contas a pagar automaticamente
              </label>
              <Field label="Parcelas">
                <Input
                  type="number"
                  min={1}
                  max={36}
                  value={installments}
                  disabled={!generatePayables}
                  onChange={(e) => setInstallments(Math.max(1, Number(e.target.value)))}
                />
              </Field>
              <Field label="1º vencimento">
                <Input
                  type="date"
                  value={firstDueDate}
                  disabled={!generatePayables}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                />
              </Field>
            </div>
            {generatePayables && Number(detail.total) > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <Receipt className="h-3.5 w-3.5" />
                Serão criadas {installments} parcela(s) a partir de {dateBR(firstDueDate)}.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* -------------------- cancelamento -------------------- */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar pedido de compra"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="danger" size="sm" loading={saving} onClick={() => void submitCancel()}>Cancelar pedido</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Pedidos com itens já recebidos não podem ser cancelados — nesse caso ajuste o estoque manualmente.
          </p>
          <Field label="Motivo" required>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex.: fornecedor não tinha o produto" autoFocus />
          </Field>
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--warning)]">
            <AlertTriangle className="h-3.5 w-3.5" /> O pedido permanece no histórico para auditoria.
          </p>
        </div>
      </Modal>
    </div>
  );
}
