"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus, FileText, Trash2, Printer, Ban, ShoppingCart, ChevronRight, Send, CalendarDays,
  TrendingUp, CheckCircle2, Percent,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateBR, dateTimeBR, num, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput, Textarea } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { VariantPicker, type VariantOption } from "@/components/stock/variant-picker";

type Quote = {
  id: string;
  code: string;
  status: string;
  validUntil: string | null;
  subtotal: string;
  discountAmount: string;
  total: string;
  notes: string | null;
  customerId: string | null;
  customerName: string | null;
  userName: string | null;
  itemCount: number;
  createdAt: string;
};

type QuoteDetail = {
  quote: Quote & { customerPhone: string | null; convertedSaleNumber: number | null };
  items: Array<{
    id: string;
    variantId: string | null;
    description: string;
    sku: string | null;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    total: string;
    colorName: string | null;
    sizeName: string | null;
    stockQty: string | null;
  }>;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  OPEN: { label: "Em aberto", tone: "warning" },
  CONVERTED: { label: "Convertido", tone: "success" },
  EXPIRED: { label: "Vencido", tone: "neutral" },
  CANCELED: { label: "Cancelado", tone: "danger" },
};

type DraftItem = { variant: VariantOption; quantity: number; unitPrice: number; discountAmount: number };

export function QuotesView({
  data,
  stats,
  filters,
  customers,
  company,
  permissions,
}: {
  data: {
    items: Quote[];
    total: number;
    totals: { total: string; open: string; converted: string };
    page: number;
    pageSize: number;
  };
  stats: { total: number; converted: number; conversionRate: number; convertedValue: string; openValue: string };
  filters: { status: string; search: string; from: string; to: string };
  customers: Array<{ id: string; name: string; phone: string | null }>;
  company: { name: string; document: string | null; phone: string | null; address: string | null };
  permissions: { canManage: boolean; canSell: boolean };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState(filters.search);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<QuoteDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [convertTarget, setConvertTarget] = React.useState<QuoteDetail | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<QuoteDetail | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // novo orçamento
  const [form, setForm] = React.useState({
    customerId: "",
    validUntil: "",
    discountAmount: 0,
    notes: "",
  });
  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [customerSearch, setCustomerSearch] = React.useState("");

  // conversão
  const [payMethod, setPayMethod] = React.useState("CASH");
  const [payInstallments, setPayInstallments] = React.useState(1);
  const [payFirstDue, setPayFirstDue] = React.useState(todayISO());
  const [extraDiscount, setExtraDiscount] = React.useState(0);
  const [payments, setPayments] = React.useState<Array<{ method: string; amount: number }>>([]);
  const [payAmount, setPayAmount] = React.useState(0);

  const subtotal = items.reduce((acc, i) => acc + i.quantity * i.unitPrice - i.discountAmount, 0);
  const total = Math.max(0, subtotal - form.discountAmount);

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "ALL") continue;
      next.set(k, String(v));
    }
    router.push(`/orcamentos?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) navigate({ search, page: undefined });
    }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function openDetail(id: string) {
    setLoadingDetail(true);
    try {
      const result = await api.get<QuoteDetail>(`/api/quotes/${id}`);
      setDetail(result);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingDetail(false);
    }
  }

  async function submitQuote() {
    if (!items.length) return toast.error("Adicione ao menos um produto.");
    setSaving(true);
    try {
      const created = await api.post<{ quote: { id: string; code: string } }>("/api/quotes", {
        customerId: form.customerId || null,
        validUntil: form.validUntil || null,
        discountAmount: form.discountAmount,
        notes: form.notes || null,
        items: items.map((i) => ({
          variantId: i.variant.variantId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
        })),
      });
      toast.success(`Orçamento ${created.quote.code} criado.`);
      setCreateOpen(false);
      setItems([]);
      setForm({ customerId: "", validUntil: "", discountAmount: 0, notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function prepareConvert(quote: QuoteDetail) {
    setConvertTarget(quote);
    const due = Number(quote.quote.total) - extraDiscount;
    setPayAmount(due > 0 ? due : 0);
    setPayments([]);
    setPayMethod("CASH");
    setPayInstallments(1);
    setPayFirstDue(todayISO());
    setExtraDiscount(0);
    if (quote.quote.customerName) setCustomerSearch(quote.quote.customerName);
  }

  const remainingToPay =
    (convertTarget ? Number(convertTarget.quote.total) - extraDiscount : 0) -
    payments.reduce((acc, p) => acc + p.amount, 0);

  async function submitConvert() {
    if (!convertTarget) return;
    const allPayments = [...payments];
    if (payAmount > 0.005) {
      allPayments.push({ method: payMethod, amount: payAmount });
    }
    if (!allPayments.length) return toast.error("Informe a forma de pagamento.");
    const diff = Number(convertTarget.quote.total) - extraDiscount - allPayments.reduce((a, p) => a + p.amount, 0);
    if (Math.abs(diff) > 0.01) {
      return toast.error(
        diff > 0 ? `Faltam ${brl(diff)} para fechar a venda.` : `O pagamento excede o total em ${brl(-diff)}.`,
      );
    }
    if (payMethod === "STORE_CREDIT" && !convertTarget.quote.customerId) {
      return toast.error("Crediário exige um cliente cadastrado no orçamento.");
    }
    setSaving(true);
    try {
      const result = await api.post<{ sale: { number: number } }>(`/api/quotes/${convertTarget.quote.id}/convert`, {
        payments: allPayments.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.method === "STORE_CREDIT" ? payInstallments : undefined,
          firstDueDate: p.method === "STORE_CREDIT" ? payFirstDue : undefined,
        })),
        discountAmount: Number(convertTarget.quote.discountAmount) + extraDiscount,
        discountReason: extraDiscount > 0 ? "Desconto na conversão do orçamento" : undefined,
      });
      toast.success(`Orçamento convertido na venda #${result.sale.number}.`);
      setConvertTarget(null);
      setDetail(null);
      router.refresh();
      router.push("/vendas");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) return toast.error("Informe o motivo.");
    setSaving(true);
    try {
      await api.post(`/api/quotes/${cancelTarget.quote.id}/cancel`, { reason: cancelReason });
      toast.success("Orçamento cancelado.");
      setCancelTarget(null);
      setCancelReason("");
      setDetail(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const filteredCustomers = React.useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 30);
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)).slice(0, 30);
  }, [customers, customerSearch]);

  const columns: Column<Quote>[] = [
    {
      key: "code",
      header: "Orçamento",
      sortable: true,
      sortValue: (q) => q.code,
      cell: (q) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{q.code}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {dateTimeBR(q.createdAt)} · {q.itemCount} item(ns)
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      sortable: true,
      sortValue: (q) => q.customerName ?? "",
      cell: (q) => <span className="truncate text-[11px]">{q.customerName ?? "Consumidor final"}</span>,
    },
    {
      key: "valid",
      header: "Validade",
      hiddenOnMobile: true,
      cell: (q) => {
        const expired = q.validUntil && q.validUntil < todayISO() && q.status === "OPEN";
        return (
          <span className={cn("text-[11px]", expired && "font-semibold text-[var(--danger)]")}>
            {q.validUntil ? dateBR(q.validUntil) : "—"}
          </span>
        );
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortValue: (q) => Number(q.total),
      cell: (q) => <span className="text-[12px] font-semibold tabular-nums">{brl(q.total)}</span>,
    },
    {
      key: "status",
      header: "Situação",
      cell: (q) => {
        const cfg = STATUS[q.status] ?? { label: q.status, tone: "neutral" as const };
        return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (q) => (
        <div className="flex justify-end gap-0.5">
          {permissions.canSell && q.status === "OPEN" && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Converter em venda"
              className="text-[var(--success)]"
              onClick={() => void openDetail(q.id).then(() => undefined)}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => void openDetail(q.id)} title="Abrir">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(data.total)} orçamento(s) · em aberto <strong className="text-[var(--warning)]">{brl(data.totals.open)}</strong>
          </p>
        </div>
        {permissions.canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Novo orçamento
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Orçamentos", value: num(stats.total), icon: FileText },
          { label: "Convertidos", value: num(stats.converted), icon: CheckCircle2 },
          { label: "Taxa de conversão", value: `${stats.conversionRate.toFixed(1)}%`, icon: Percent },
          { label: "Valor convertido", value: brl(stats.convertedValue), icon: TrendingUp },
        ].map((kpi) => (
          <Card key={kpi.label} className="flex items-center gap-3 p-3">
            <div className="rounded-lg bg-[var(--bg-muted)] p-2 text-[var(--accent-strong)]">
              <kpi.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{kpi.label}</p>
              <p className="truncate text-sm font-bold tabular-nums">{kpi.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Situação" className="w-40">
            <Select value={filters.status} onChange={(e) => navigate({ status: e.target.value, page: undefined })}>
              <option value="ALL">Todos</option>
              {Object.entries(STATUS).map(([value, cfg]) => (
                <option key={value} value={value}>{cfg.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="De" className="w-36">
            <Input type="date" value={filters.from} onChange={(e) => navigate({ from: e.target.value, page: undefined })} />
          </Field>
          <Field label="Até" className="w-36">
            <Input type="date" value={filters.to} onChange={(e) => navigate({ to: e.target.value, page: undefined })} />
          </Field>
          <Field label="Buscar" className="min-w-[200px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Código ou cliente..." />
          </Field>
        </div>
      </Card>

      <DataTable
        data={data.items}
        columns={columns}
        keyExtractor={(q) => q.id}
        pagination={{
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onPageChange: (page) => navigate({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Nenhum orçamento"
            description="Monte um orçamento para o cliente, imprima ou envie pelo WhatsApp e converta em venda quando aprovado."
            action={permissions.canManage ? <Button size="sm" onClick={() => setCreateOpen(true)}>Novo orçamento</Button> : undefined}
          />
        }
      />

      {/* -------------------- criar -------------------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo orçamento"
        size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void submitQuote()} leftIcon={<Send className="h-4 w-4" />}>
              Salvar orçamento
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cliente" className="sm:col-span-2">
              <Input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setForm({ ...form, customerId: "" });
                }}
                placeholder="Buscar cliente por nome ou telefone..."
              />
              {customerSearch && !form.customerId && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--border-default)]">
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ ...form, customerId: "" });
                      setCustomerSearch("");
                    }}
                    className="block w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-muted)]"
                  >
                    Consumidor final
                  </button>
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, customerId: c.id });
                        setCustomerSearch(c.name);
                      }}
                      className="block w-full border-t border-[var(--border-subtle)] px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-muted)]"
                    >
                      {c.name} {c.phone ? <span className="text-[var(--text-muted)]">· {c.phone}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Validade" hint="Padrão: 15 dias">
              <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </Field>
          </div>

          <VariantPicker
            onSelect={(variant) => {
              const idx = items.findIndex((i) => i.variant.variantId === variant.variantId);
              if (idx >= 0) {
                setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, quantity: i.quantity + 1 } : i)));
                return;
              }
              setItems((prev) => [
                ...prev,
                {
                  variant,
                  quantity: 1,
                  unitPrice: Number(variant.effectivePrice),
                  discountAmount: 0,
                },
              ]);
            }}
            placeholder="Buscar produto para o orçamento..."
          />

          {items.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
              <table className="w-full text-[12px]">
                <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-2 py-2 text-right">Qtd</th>
                    <th className="px-2 py-2 text-right">Preço</th>
                    <th className="px-2 py-2 text-right">Desconto</th>
                    <th className="px-2 py-2 text-right">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.variant.variantId} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-2">
                        <p className="font-semibold">{item.variant.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {item.variant.sku}
                          {item.variant.sizeName ? ` · ${item.variant.sizeName}` : ""} · estoque {num(item.variant.stockQty)}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          className="w-16 text-right"
                          onChange={(e) => setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, quantity: Number(e.target.value) } : i)))}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <MoneyInput
                          value={item.unitPrice}
                          className="w-24"
                          onChange={(v) => setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, unitPrice: v } : i)))}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <MoneyInput
                          value={item.discountAmount}
                          className="w-20"
                          onChange={(v) => setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, discountAmount: v } : i)))}
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {brl(item.quantity * item.unitPrice - item.discountAmount)}
                      </td>
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

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Desconto no orçamento (R$)">
              <MoneyInput value={form.discountAmount} onChange={(v) => setForm({ ...form, discountAmount: v })} />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Condições, prazo de entrega, etc." />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-muted)] px-3 py-2.5 text-xs">
            <span className="text-[var(--text-muted)]">Subtotal {brl(subtotal)} · desconto {brl(form.discountAmount)}</span>
            <span className="text-base font-bold tabular-nums">{brl(total)}</span>
          </div>
        </div>
      </Modal>

      {/* -------------------- detalhe -------------------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Orçamento ${detail.quote.code}` : "Orçamento"}
        description={detail?.quote.customerName ?? "Consumidor final"}
        size="lg"
        footer={
          detail && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.print()} leftIcon={<Printer className="h-4 w-4" />}>
                Imprimir
              </Button>
              {permissions.canManage && detail.quote.status !== "CONVERTED" && detail.quote.status !== "CANCELED" && (
                <Button variant="outline" size="sm" className="text-[var(--danger)]" onClick={() => setCancelTarget(detail)} leftIcon={<Ban className="h-4 w-4" />}>
                  Cancelar
                </Button>
              )}
              {permissions.canSell && detail.quote.status === "OPEN" && (
                <Button size="sm" onClick={() => prepareConvert(detail)} leftIcon={<ShoppingCart className="h-4 w-4" />}>
                  Converter em venda
                </Button>
              )}
            </>
          )
        }
      >
        {loadingDetail ? (
          <p className="text-xs text-[var(--text-muted)]">Carregando...</p>
        ) : detail ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border-default)] p-3">
              <div className="mb-2 flex items-start justify-between border-b border-[var(--border-subtle)] pb-2">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold">{company.name}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {company.document ? `CNPJ ${company.document}` : ""} {company.phone ? `· ${company.phone}` : ""}
                  </p>
                </div>
                <div className="text-right text-[10px] text-[var(--text-muted)]">
                  <p>{dateTimeBR(detail.quote.createdAt)}</p>
                  <p>Validade: {detail.quote.validUntil ? dateBR(detail.quote.validUntil) : "—"}</p>
                </div>
              </div>
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="py-1 text-left">Item</th>
                    <th className="py-1 text-right">Qtd</th>
                    <th className="py-1 text-right">Preço</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-1">
                        {item.description}
                        {item.stockQty !== null && Number(item.stockQty) <= 0 && (
                          <Badge tone="danger" className="ml-1">sem estoque</Badge>
                        )}
                      </td>
                      <td className="py-1 text-right tabular-nums">{num(item.quantity)}</td>
                      <td className="py-1 text-right tabular-nums">{brl(item.unitPrice)}</td>
                      <td className="py-1 text-right tabular-nums">{brl(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 space-y-0.5 border-t border-[var(--border-subtle)] pt-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Subtotal</span>
                  <span className="tabular-nums">{brl(detail.quote.subtotal)}</span>
                </div>
                {Number(detail.quote.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Desconto</span>
                    <span className="tabular-nums text-[var(--danger)]">-{brl(detail.quote.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{brl(detail.quote.total)}</span>
                </div>
              </div>
              {detail.quote.notes && <p className="mt-2 text-[10px] text-[var(--text-muted)]">{detail.quote.notes}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Badge tone={STATUS[detail.quote.status]?.tone ?? "neutral"}>{STATUS[detail.quote.status]?.label ?? detail.quote.status}</Badge>
              {detail.quote.convertedSaleNumber && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-[var(--success)]" /> Venda #{detail.quote.convertedSaleNumber}
                </span>
              )}
              {detail.quote.customerPhone && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[var(--info)] hover:underline"
                  onClick={() => {
                    const text = encodeURIComponent(
                      `Olá! Segue o orçamento ${detail.quote.code} no valor de ${brl(detail.quote.total)}. ` +
                        `Itens: ${detail.items.map((i) => `${i.quantity}x ${i.description}`).join(", ")}. ` +
                        `Validade: ${detail.quote.validUntil ? dateBR(detail.quote.validUntil) : "a combinar"}.`,
                    );
                    window.open(`https://wa.me/55${(detail.quote.customerPhone ?? "").replace(/\D/g, "")}?text=${text}`, "_blank");
                  }}
                >
                  Enviar pelo WhatsApp
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* -------------------- converter -------------------- */}
      <Modal
        open={Boolean(convertTarget)}
        onClose={() => setConvertTarget(null)}
        title="Converter orçamento em venda"
        description={convertTarget?.quote.code}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConvertTarget(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void submitConvert()} leftIcon={<ShoppingCart className="h-4 w-4" />}>
              Finalizar venda
            </Button>
          </>
        }
      >
        {convertTarget && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Total do orçamento</span>
                <span className="font-semibold tabular-nums">{brl(convertTarget.quote.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Desconto adicional</span>
                <span className="font-semibold tabular-nums text-[var(--danger)]">-{brl(extraDiscount)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border-default)] pt-1 font-bold">
                <span>A pagar</span>
                <span className="tabular-nums">{brl(Number(convertTarget.quote.total) - extraDiscount)}</span>
              </div>
            </div>

            <Field label="Desconto adicional na conversão (R$)">
              <MoneyInput
                value={extraDiscount}
                onChange={(v) => {
                  setExtraDiscount(v);
                  setPayAmount(Math.max(0, Number(convertTarget.quote.total) - v));
                }}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Forma de pagamento">
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="CASH">Dinheiro</option>
                  <option value="PIX">Pix</option>
                  <option value="DEBIT">Cartão de débito</option>
                  <option value="CREDIT">Cartão de crédito</option>
                  <option value="STORE_CREDIT">Crediário</option>
                  <option value="TRANSFER">Transferência</option>
                </Select>
              </Field>
              <Field label="Valor" hint={remainingToPay > 0 ? `Restam ${brl(remainingToPay)}` : "Total quitado"}>
                <MoneyInput value={payAmount} onChange={setPayAmount} />
              </Field>
              {payMethod === "STORE_CREDIT" && (
                <>
                  <Field label="Parcelas">
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={payInstallments}
                      onChange={(e) => setPayInstallments(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="1º vencimento">
                    <Input type="date" value={payFirstDue} onChange={(e) => setPayFirstDue(e.target.value)} />
                  </Field>
                </>
              )}
            </div>

            {payments.length > 0 && (
              <div className="space-y-1">
                {payments.map((p, i) => (
                  <div key={`${p.method}-${i}`} className="flex items-center justify-between rounded bg-[var(--bg-muted)] px-2 py-1 text-[11px]">
                    <span>{p.method} · {brl(p.amount)}</span>
                    <button onClick={() => setPayments((prev) => prev.filter((_, n) => n !== i))} className="text-[var(--danger)]">
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            {remainingToPay > 0.005 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (payAmount <= 0) return toast.error("Informe o valor.");
                  setPayments((prev) => [...prev, { method: payMethod, amount: payAmount }]);
                  setPayAmount(Math.max(0, remainingToPay - payAmount));
                }}
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Adicionar forma de pagamento
              </Button>
            )}

            <Alert tone="info">
              A conversão baixa o estoque, registra o pagamento no caixa/conta e gera as parcelas do crediário quando
              houver. O orçamento fica marcado como convertido.
            </Alert>

            {!convertTarget.quote.customerId && payMethod === "STORE_CREDIT" && (
              <Alert tone="warning">Para crediário é necessário um cliente cadastrado no orçamento.</Alert>
            )}
          </div>
        )}
      </Modal>

      {/* -------------------- cancelar -------------------- */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancelar orçamento"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button variant="danger" size="sm" loading={saving} onClick={() => void submitCancel()}>Cancelar orçamento</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Motivo" required>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex.: cliente desistiu" autoFocus />
          </Field>
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <CalendarDays className="h-3.5 w-3.5" /> O orçamento permanece no histórico.
          </p>
        </div>
      </Modal>
    </div>
  );
}
