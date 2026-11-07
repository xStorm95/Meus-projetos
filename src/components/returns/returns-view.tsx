"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  RotateCcw, Plus, Search, ArrowLeftRight, Wallet, AlertTriangle, ChevronRight, PackageCheck,
  Trash2, Info, BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateBR, dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, Select, SearchInput, Textarea } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { VariantPicker, type VariantOption } from "@/components/stock/variant-picker";

type ReturnRow = {
  id: string;
  code: string;
  type: string;
  saleNumber: number | null;
  customerName: string | null;
  reason: string;
  refundMethod: string;
  returnedTotal: string;
  creditGenerated: string;
  difference: string;
  userName: string | null;
  notes: string | null;
  createdAt: string;
  itemsCount: number;
};

type SaleForReturn = {
  sale: {
    id: string;
    number: number;
    total: string;
    createdAt: string;
    customerId: string | null;
    customerName: string | null;
    customerPhone: string | null;
  };
  items: Array<{
    id: string;
    variantId: string | null;
    description: string;
    sku: string | null;
    colorName: string | null;
    sizeName: string | null;
    quantity: string;
    returnedQty: string;
    availableQty: string;
    unitPrice: string;
    total: string;
  }>;
  creditAvailable: string;
};

type ReturnDetail = {
  returnRecord: ReturnRow;
  items: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
    action: string;
    sku: string | null;
    colorName: string | null;
    sizeName: string | null;
  }>;
};

const REFUND_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  STORE_CREDIT: "Crédito na loja",
  EXCHANGE: "Troca de produto",
  NONE: "Sem reembolso",
};

const ACTION_LABELS: Record<string, string> = {
  RESTOCK: "Reintegrar ao estoque",
  DAMAGED: "Avariado (não reintegrar)",
  DISCARD: "Descartar",
};

export function ReturnsView({
  data,
  filters,
  permissions,
}: {
  data: {
    items: ReturnRow[];
    total: number;
    totals: { returned: string; credits: string; exchanges: number; returns: number };
    page: number;
    pageSize: number;
  };
  filters: { type: string; search: string; from: string; to: string };
  permissions: { canCreate: boolean };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState(filters.search);
  const [saving, setSaving] = React.useState(false);

  const [newOpen, setNewOpen] = React.useState(false);
  const [saleRef, setSaleRef] = React.useState("");
  const [sale, setSale] = React.useState<SaleForReturn | null>(null);
  const [loadingSale, setLoadingSale] = React.useState(false);
  const [returnType, setReturnType] = React.useState<"RETURN" | "EXCHANGE">("RETURN");
  const [reason, setReason] = React.useState("");
  const [refundMethod, setRefundMethod] = React.useState("STORE_CREDIT");
  const [notes, setNotes] = React.useState("");
  const [selected, setSelected] = React.useState<Record<string, { qty: number; action: "RESTOCK" | "DAMAGED" | "DISCARD" }>>({});
  const [exchangeItems, setExchangeItems] = React.useState<Array<{ variant: VariantOption; quantity: number }>>([]);

  const [detail, setDetail] = React.useState<ReturnDetail | null>(null);

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "ALL") continue;
      next.set(k, String(v));
    }
    router.push(`/trocas?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) navigate({ search, page: undefined });
    }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadSale() {
    if (!saleRef.trim()) return toast.error("Informe o número ou código da venda.");
    setLoadingSale(true);
    try {
      const result = await api.get<SaleForReturn>(`/api/returns/sale/${encodeURIComponent(saleRef.trim())}`);
      setSale(result);
      setSelected({});
      setReason("");
      setNotes("");
      setExchangeItems([]);
      setRefundMethod("STORE_CREDIT");
    } catch (err) {
      setSale(null);
      toast.error(errorMessage(err));
    } finally {
      setLoadingSale(false);
    }
  }

  const returnedTotal = sale
    ? sale.items.reduce((acc, item) => {
        const sel = selected[item.id];
        if (!sel) return acc;
        return acc + sel.qty * (Number(item.total) / Number(item.quantity));
      }, 0)
    : 0;
  const newItemsTotal = exchangeItems.reduce((acc, i) => acc + i.quantity * Number(i.variant.effectivePrice), 0);
  const difference = newItemsTotal - returnedTotal;

  async function submit() {
    if (!sale) return;
    const items = Object.entries(selected)
      .filter(([, v]) => v.qty > 0)
      .map(([saleItemId, v]) => ({ saleItemId, quantity: v.qty, action: v.action }));
    if (!items.length) return toast.error("Selecione ao menos um item para devolver.");
    if (reason.trim().length < 3) return toast.error("Informe o motivo da troca/devolução.");
    if (returnType === "EXCHANGE" && !exchangeItems.length) return toast.error("Adicione os produtos da troca.");
    setSaving(true);
    try {
      const result = await api.post<{ returnRecord: { id: string; code: string }; difference: string }>("/api/returns", {
        saleId: sale.sale.id,
        type: returnType,
        reason,
        refundMethod: returnType === "EXCHANGE" ? "EXCHANGE" : refundMethod,
        notes: notes || undefined,
        items,
        exchangeItems:
          returnType === "EXCHANGE"
            ? exchangeItems.map((i) => ({ variantId: i.variant.variantId, quantity: i.quantity }))
            : undefined,
      });
      toast.success(
        `${returnType === "EXCHANGE" ? "Troca" : "Devolução"} ${result.returnRecord.code} registrada.` +
          (Number(result.difference) < 0
            ? ` Crédito de ${brl(Math.abs(Number(result.difference)))} gerado.`
            : Number(result.difference) > 0
              ? ` Cliente pagou ${brl(Number(result.difference))} de diferença.`
              : ""),
      );
      setNewOpen(false);
      setSale(null);
      setSaleRef("");
      setSelected({});
      setExchangeItems([]);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    try {
      setDetail(await api.get<ReturnDetail>(`/api/returns/${id}`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<ReturnRow>[] = [
    {
      key: "code",
      header: "Documento",
      sortable: true,
      sortValue: (r) => r.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge tone={r.type === "EXCHANGE" ? "info" : "warning"}>
              {r.type === "EXCHANGE" ? "Troca" : "Devolução"}
            </Badge>
            <span className="text-[12px] font-semibold">{r.code}</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {dateTimeBR(r.createdAt)} · {r.itemsCount} item(ns)
            {r.saleNumber ? ` · venda #${r.saleNumber}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      sortable: true,
      sortValue: (r) => r.customerName ?? "",
      cell: (r) => <span className="truncate text-[11px]">{r.customerName ?? "Consumidor final"}</span>,
    },
    {
      key: "reason",
      header: "Motivo",
      hiddenOnMobile: true,
      cell: (r) => <span className="line-clamp-2 max-w-[240px] text-[11px] text-[var(--text-secondary)]">{r.reason}</span>,
    },
    {
      key: "refund",
      header: "Reembolso",
      hiddenOnMobile: true,
      cell: (r) => <span className="text-[11px]">{REFUND_LABELS[r.refundMethod] ?? r.refundMethod}</span>,
    },
    {
      key: "total",
      header: "Valor",
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.returnedTotal),
      cell: (r) => <span className="text-[12px] font-semibold tabular-nums">{brl(r.returnedTotal)}</span>,
    },
    {
      key: "credit",
      header: "Crédito",
      align: "right",
      hiddenOnMobile: true,
      cell: (r) =>
        Number(r.creditGenerated) > 0 ? (
          <span className="text-[11px] font-semibold text-[var(--success)]">{brl(r.creditGenerated)}</span>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button variant="ghost" size="icon-sm" onClick={() => void openDetail(r.id)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Trocas e devoluções
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(data.total)} registro(s) · devolvido {brl(data.totals.returned)} · créditos gerados{" "}
            <strong className="text-[var(--success)]">{brl(data.totals.credits)}</strong>
          </p>
        </div>
        {permissions.canCreate && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
            Nova troca/devolução
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Trocas", value: num(data.totals.exchanges), icon: ArrowLeftRight },
          { label: "Devoluções", value: num(data.totals.returns), icon: RotateCcw },
          { label: "Valor devolvido", value: brl(data.totals.returned), icon: Wallet },
          { label: "Créditos na loja", value: brl(data.totals.credits), icon: BadgeCheck },
        ].map((k) => (
          <Card key={k.label} className="flex items-center gap-3 p-3">
            <div className="rounded-lg bg-[var(--bg-muted)] p-2 text-[var(--accent-strong)]">
              <k.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{k.label}</p>
              <p className="truncate text-sm font-bold tabular-nums">{k.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Tipo" className="w-40">
            <Select value={filters.type} onChange={(e) => navigate({ type: e.target.value, page: undefined })}>
              <option value="ALL">Todos</option>
              <option value="EXCHANGE">Trocas</option>
              <option value="RETURN">Devoluções</option>
            </Select>
          </Field>
          <Field label="De" className="w-36">
            <Input type="date" value={filters.from} onChange={(e) => navigate({ from: e.target.value, page: undefined })} />
          </Field>
          <Field label="Até" className="w-36">
            <Input type="date" value={filters.to} onChange={(e) => navigate({ to: e.target.value, page: undefined })} />
          </Field>
          <Field label="Buscar" className="min-w-[200px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Documento, cliente ou venda..." />
          </Field>
        </div>
      </Card>

      <DataTable
        data={data.items}
        columns={columns}
        keyExtractor={(r) => r.id}
        pagination={{
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onPageChange: (page) => navigate({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<RotateCcw className="h-6 w-6" />}
            title="Nenhuma troca ou devolução"
            description="Registre trocas com controle de estoque, crédito na loja e estorno financeiro automático."
            action={permissions.canCreate ? <Button size="sm" onClick={() => setNewOpen(true)}>Nova troca/devolução</Button> : undefined}
          />
        }
      />

      {/* -------------------- nova troca/devolução -------------------- */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Nova troca ou devolução"
        description="Localize a venda original para começar"
        size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!sale} loading={saving} onClick={() => void submit()}>
              Confirmar {returnType === "EXCHANGE" ? "troca" : "devolução"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Venda (número)" className="min-w-[180px] flex-1">
              <div className="flex gap-2">
                <Input
                  value={saleRef}
                  onChange={(e) => setSaleRef(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadSale()}
                  placeholder="Ex.: 212"
                  autoFocus
                />
                <Button variant="outline" size="sm" loading={loadingSale} onClick={() => void loadSale()}>
                  Buscar
                </Button>
              </div>
            </Field>
            <Field label="Tipo" className="w-44">
              <Select value={returnType} onChange={(e) => setReturnType(e.target.value as never)}>
                <option value="RETURN">Devolução</option>
                <option value="EXCHANGE">Troca</option>
              </Select>
            </Field>
          </div>

          {sale && (
            <>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">
                    Venda #{sale.sale.number} · {sale.sale.customerName ?? "Consumidor final"}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {dateBR(sale.sale.createdAt.slice(0, 10))} · total {brl(sale.sale.total)} · crédito disponível{" "}
                    {brl(sale.creditAvailable)}
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
                <table className="w-full text-[12px]">
                  <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Item da venda</th>
                      <th className="px-2 py-2 text-right">Comprado</th>
                      <th className="px-2 py-2 text-right">Já devolvido</th>
                      <th className="px-2 py-2 text-right">Devolver</th>
                      <th className="px-2 py-2 text-left">Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((item) => {
                      const available = Number(item.availableQty);
                      const sel = selected[item.id];
                      return (
                        <tr key={item.id} className={cn("border-t border-[var(--border-subtle)]", available <= 0 && "opacity-50")}>
                          <td className="px-3 py-2">
                            <p className="font-semibold">{item.description}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {item.sku} · {brl(Number(item.total) / Number(item.quantity))} / un.
                            </p>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{num(item.quantity)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{num(item.returnedQty)}</td>
                          <td className="px-2 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={available}
                              disabled={available <= 0}
                              value={sel?.qty ?? 0}
                              className="w-16 text-right"
                              onChange={(e) => {
                                const qty = Math.min(available, Math.max(0, Number(e.target.value)));
                                setSelected((prev) => ({
                                  ...prev,
                                  [item.id]: { qty, action: prev[item.id]?.action ?? "RESTOCK" },
                                }));
                              }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Select
                              value={sel?.action ?? "RESTOCK"}
                              disabled={available <= 0}
                              onChange={(e) =>
                                setSelected((prev) => ({
                                  ...prev,
                                  [item.id]: { qty: prev[item.id]?.qty ?? 0, action: e.target.value as never },
                                }))
                              }
                              className="w-40"
                            >
                              <option value="RESTOCK">Reintegrar</option>
                              <option value="DAMAGED">Avaria</option>
                              <option value="DISCARD">Descartar</option>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {returnType === "EXCHANGE" && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Produtos que o cliente leva na troca</p>
                  <VariantPicker
                    onSelect={(variant) =>
                      setExchangeItems((prev) =>
                        prev.some((i) => i.variant.variantId === variant.variantId)
                          ? prev
                          : [...prev, { variant, quantity: 1 }],
                      )
                    }
                  />
                  {exchangeItems.map((item, idx) => (
                    <div key={item.variant.variantId} className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold">{item.variant.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {item.variant.sku} · {brl(item.variant.effectivePrice)} · estoque {num(item.variant.stockQty)}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        className="w-16 text-right"
                        onChange={(e) =>
                          setExchangeItems((prev) => prev.map((i, n) => (n === idx ? { ...i, quantity: Number(e.target.value) } : i)))
                        }
                      />
                      <Button variant="ghost" size="icon-sm" onClick={() => setExchangeItems((prev) => prev.filter((_, n) => n !== idx))}>
                        <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Motivo" required>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: tamanho não serviu" />
                </Field>
                {returnType === "RETURN" && (
                  <Field label="Forma de reembolso">
                    <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                      <option value="STORE_CREDIT">Crédito na loja</option>
                      <option value="CASH">Dinheiro</option>
                      <option value="PIX">Pix</option>
                      <option value="DEBIT">Cartão de débito</option>
                      <option value="CREDIT">Cartão de crédito</option>
                      <option value="NONE">Sem reembolso (só baixa)</option>
                    </Select>
                  </Field>
                )}
              </div>

              <div className="rounded-xl bg-[var(--bg-muted)] p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Valor devolvido</span>
                  <span className="font-semibold tabular-nums">{brl(returnedTotal)}</span>
                </div>
                {returnType === "EXCHANGE" && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Produtos da troca</span>
                    <span className="font-semibold tabular-nums">{brl(newItemsTotal)}</span>
                  </div>
                )}
                <div className={cn("mt-1 flex justify-between border-t border-[var(--border-default)] pt-1 text-sm font-bold", difference < 0 ? "text-[var(--success)]" : difference > 0 ? "text-[var(--danger)]" : "")}>
                  <span>{difference < 0 ? "Crédito ao cliente" : difference > 0 ? "Cliente paga" : "Sem diferença"}</span>
                  <span className="tabular-nums">{brl(Math.abs(difference))}</span>
                </div>
              </div>

              {refundMethod === "STORE_CREDIT" && returnType === "RETURN" && difference < 0 && (
                <Alert tone="success">
                  Será gerado um crédito de {brl(Math.abs(difference))} para o cliente usar em compras futuras.
                </Alert>
              )}
              {!sale.sale.customerId && refundMethod === "STORE_CREDIT" && (
                <Alert tone="warning">
                  A venda não tem cliente cadastrado — não é possível gerar crédito na loja. Selecione outra forma de
                  reembolso.
                </Alert>
              )}
            </>
          )}

          {!sale && (
            <div className="flex items-start gap-2 rounded-xl bg-[var(--bg-muted)] p-3 text-[11px] text-[var(--text-muted)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Apenas vendas concluídas podem gerar troca ou devolução. O sistema controla quanto de cada item já foi
                devolvido, impede devolver acima do comprado e registra tudo no histórico.
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* -------------------- detalhe -------------------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.returnRecord.type === "EXCHANGE" ? "Troca" : "Devolução"} ${detail.returnRecord.code}` : ""}
        description={detail?.returnRecord.customerName ?? undefined}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>Imprimir</Button>
            <Button size="sm" onClick={() => setDetail(null)}>Fechar</Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-3 text-[12px]">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-[var(--bg-muted)] p-2">
                <p className="text-[9px] uppercase text-[var(--text-muted)]">Devolvido</p>
                <p className="font-bold tabular-nums">{brl(detail.returnRecord.returnedTotal)}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2">
                <p className="text-[9px] uppercase text-[var(--text-muted)]">Crédito gerado</p>
                <p className="font-bold tabular-nums">{brl(detail.returnRecord.creditGenerated)}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2">
                <p className="text-[9px] uppercase text-[var(--text-muted)]">Reembolso</p>
                <p className="font-bold">{REFUND_LABELS[detail.returnRecord.refundMethod] ?? detail.returnRecord.refundMethod}</p>
              </div>
            </div>
            <p className="text-[11px]">
              <strong>Motivo:</strong> {detail.returnRecord.reason}
            </p>
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th className="py-1 text-left">Item</th>
                  <th className="py-1 text-right">Qtd</th>
                  <th className="py-1 text-right">Valor</th>
                  <th className="py-1 text-left">Destino</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-1">
                      {item.description}
                      <span className="block text-[9px] text-[var(--text-muted)]">{item.sku}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums">{num(item.quantity)}</td>
                    <td className="py-1 text-right tabular-nums">{brl(item.total)}</td>
                    <td className="py-1">
                      <Badge tone={item.action === "RESTOCK" ? "success" : "warning"}>{ACTION_LABELS[item.action] ?? item.action}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.returnRecord.saleNumber && (
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <PackageCheck className="h-3.5 w-3.5" /> Venda original #{detail.returnRecord.saleNumber}
              </p>
            )}
            {detail.returnRecord.notes && <p className="text-[11px] text-[var(--text-secondary)]">{detail.returnRecord.notes}</p>}
            <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <AlertTriangle className="h-3 w-3" /> Registro imutável — movimentações de estoque e financeiro já foram
              lançadas.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
