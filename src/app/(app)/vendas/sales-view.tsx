"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Receipt, Eye, XCircle, Download, Ban, TrendingUp, Search, Printer, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal } from "@/components/ui/primitives";
import { Field, Select, SearchInput, Input } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SALE_STATUS, PERIOD_PRESETS } from "@/lib/constants";

type SaleRow = {
  id: string;
  number: number;
  status: string;
  total: string;
  profit: string;
  itemCount: number;
  createdAt: string;
  customerName: string | null;
  sellerName: string | null;
  originType: string;
};

export function SalesView({
  initial,
  filters,
  permissions,
}: {
  initial: { items: SaleRow[]; total: number; summary: { total: string; profit: string }; page: number; pageSize: number };
  filters: { from: string; to: string; status: string; search: string; preset: string };
  permissions: { canCancel: boolean; canExport: boolean; canSeeProfit: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(filters.search);
  const [cancelSale, setCancelSale] = React.useState<SaleRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [detail, setDetail] = React.useState<SaleRow | null>(null);

  function applyFilters(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === "ALL") next.delete(key);
      else next.set(key, String(value));
    }
    if (!("page" in patch)) next.delete("page");
    router.push(`/vendas?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) applyFilters({ search });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCancel() {
    if (!cancelSale) return;
    if (reason.trim().length < 5) {
      toast.error("Informe a justificativa do cancelamento (mínimo 5 caracteres).");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/sales/${cancelSale.id}/cancel`, { reason });
      toast.success(`Venda #${cancelSale.number} cancelada. Estoque e financeiro estornados.`);
      setCancelSale(null);
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    try {
      await downloadFile("/api/reports/sales/export", {
        format: "csv",
        from: filters.from,
        to: filters.to,
      });
      toast.success("Relatório gerado.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<SaleRow>[] = [
    {
      key: "number",
      header: "Venda",
      sortable: true,
      sortValue: (s) => s.number,
      cell: (s) => (
        <div>
          <p className="text-[13px] font-semibold">#{s.number}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{s.originType === "QUOTE" ? "via orçamento" : "PDV"}</p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Data / hora",
      sortable: true,
      sortValue: (s) => s.createdAt,
      cell: (s) => <span className="whitespace-nowrap text-[11px]">{dateTimeBR(s.createdAt)}</span>,
    },
    {
      key: "customer",
      header: "Cliente",
      hiddenOnMobile: true,
      cell: (s) => (
        <span className="text-[11px] text-[var(--text-secondary)]">{s.customerName ?? "Consumidor"}</span>
      ),
    },
    {
      key: "seller",
      header: "Vendedor",
      hiddenOnMobile: true,
      cell: (s) => <span className="text-[11px] text-[var(--text-muted)]">{s.sellerName ?? "—"}</span>,
    },
    {
      key: "items",
      header: "Itens",
      align: "center",
      hiddenOnMobile: true,
      cell: (s) => <span className="text-[11px] tabular-nums">{s.itemCount}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortValue: (s) => Number(s.total),
      cell: (s) => (
        <span className={cn("text-xs font-bold tabular-nums", s.status === "CANCELED" && "line-through text-[var(--text-muted)]")}>
          {brl(s.total)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (s) => {
        const cfg = SALE_STATUS[s.status];
        return (
          <Badge tone={(cfg?.tone as "success" | "warning" | "danger") ?? "neutral"}>
            {cfg?.label ?? s.status}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (s) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon-sm" title="Detalhes" onClick={(e) => { e.stopPropagation(); setDetail(s); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <a href={`/api/sales/${s.id}/receipt`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" title="Comprovante">
              <Printer className="h-3.5 w-3.5" />
            </Button>
          </a>
          {permissions.canCancel && s.status !== "CANCELED" && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Cancelar venda"
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              onClick={(e) => { e.stopPropagation(); setCancelSale(s); }}
            >
              <XCircle className="h-3.5 w-3.5" />
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
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Vendas</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(initial.total)} venda(s) · total {brl(initial.summary.total)}
            {permissions.canSeeProfit && ` · lucro ${brl(initial.summary.profit)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {permissions.canExport && (
            <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => void exportCsv()}>
              Exportar
            </Button>
          )}
          <Link href="/pdv">
            <Button size="sm" leftIcon={<ShoppingBag className="h-4 w-4" />}>Nova venda</Button>
          </Link>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Período" className="w-48">
            <Select
              value={filters.preset}
              onChange={(e) => {
                const value = e.target.value;
                const next = new URLSearchParams(params.toString());
                next.set("period", value);
                next.delete("from");
                next.delete("to");
                next.delete("page");
                router.push(`/vendas?${next.toString()}`);
              }}
            >
              {PERIOD_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="De" className="w-36">
            <Input type="date" value={filters.from} onChange={(e) => applyFilters({ from: e.target.value, period: "custom" })} />
          </Field>
          <Field label="Até" className="w-36">
            <Input type="date" value={filters.to} onChange={(e) => applyFilters({ to: e.target.value, period: "custom" })} />
          </Field>
          <Field label="Situação" className="w-36">
            <Select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })}>
              <option value="ALL">Todas</option>
              <option value="COMPLETED">Finalizadas</option>
              <option value="OPEN">Em aberto</option>
              <option value="CANCELED">Canceladas</option>
            </Select>
          </Field>
          <Field label="Buscar" className="min-w-[200px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Nº da venda ou cliente..." />
          </Field>
        </div>
      </Card>

      <DataTable
        data={initial.items}
        columns={columns}
        keyExtractor={(s) => s.id}
        onRowClick={(s) => router.push(`/vendas/${s.id}`)}
        pagination={{
          page: initial.page,
          pageSize: initial.pageSize,
          total: initial.total,
          onPageChange: (page) => applyFilters({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nenhuma venda encontrada"
            description="Ajuste o período ou os filtros. Novas vendas aparecem aqui assim que finalizadas."
            action={
              <Link href="/pdv">
                <Button leftIcon={<ShoppingBag className="h-4 w-4" />}>Iniciar venda</Button>
              </Link>
            }
          />
        }
      />

      {/* Cancelar venda */}
      <Modal
        open={Boolean(cancelSale)}
        onClose={() => setCancelSale(null)}
        title={`Cancelar venda #${cancelSale?.number ?? ""}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelSale(null)}>Voltar</Button>
            <Button variant="danger" size="sm" loading={saving} onClick={() => void handleCancel()}>
              Confirmar cancelamento
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
            <p className="flex items-center gap-1.5 font-semibold">
              <Ban className="h-3.5 w-3.5" /> Esta ação não pode ser desfeita
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 opacity-90">
              <li>O estoque dos itens será devolvido</li>
              <li>Os movimentos de caixa serão estornados</li>
              <li>As parcelas em aberto serão canceladas</li>
              <li>O cancelamento ficará registrado na auditoria</li>
            </ul>
          </div>
          <Field label="Justificativa do cancelamento" required>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente desistiu da compra, erro de lançamento..."
              autoFocus
            />
          </Field>
        </div>
      </Modal>

      {/* Detalhe rápido */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Venda #${detail?.number ?? ""}`} size="sm">
        {detail && (
          <div className="space-y-2 text-xs">
            <Row label="Total" value={brl(detail.total)} />
            <Row label="Itens" value={String(detail.itemCount)} />
            <Row label="Cliente" value={detail.customerName ?? "Consumidor"} />
            <Row label="Vendedor" value={detail.sellerName ?? "—"} />
            <Row label="Data" value={dateTimeBR(detail.createdAt)} />
            <Row label="Situação" value={SALE_STATUS[detail.status]?.label ?? detail.status} />
            <div className="flex gap-2 pt-2">
              <Link href={`/vendas/${detail.id}`} className="flex-1">
                <Button size="sm" variant="outline" className="w-full" leftIcon={<Receipt className="h-3.5 w-3.5" />}>
                  Ver detalhes
                </Button>
              </Link>
              <a href={`/api/sales/${detail.id}/receipt`} target="_blank" rel="noreferrer" className="flex-1">
                <Button size="sm" className="w-full" leftIcon={<Printer className="h-3.5 w-3.5" />}>
                  Comprovante
                </Button>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--border-default)] pb-1.5">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

void TrendingUp;
