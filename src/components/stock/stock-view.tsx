"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes, AlertTriangle, PackageX, DollarSign, Plus, ArrowDownToLine, ArrowUpFromLine,
  ClipboardCheck, RefreshCw, Download, TrendingDown, History, Trash2, ArrowRightLeft, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, num, dateTimeBR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert, Tabs } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput, Textarea } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { STOCK_MOVEMENT_LABELS } from "@/lib/constants";
import { VariantPicker, type VariantOption } from "./variant-picker";

type Position = {
  variantId: string;
  productId: string;
  productName: string;
  reference: string;
  sku: string;
  barcode: string | null;
  colorName: string | null;
  sizeName: string | null;
  stockQty: string;
  reservedQty: string;
  costPrice: string;
  salePrice: string;
  lowStock: number;
  categoryName: string | null;
  valueCost: string;
};

type Movement = {
  id: string;
  createdAt: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  unitCost: string | null;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  userName: string | null;
  sku: string | null;
  colorName: string | null;
  sizeName: string | null;
  productName: string | null;
  warehouseName: string | null;
};

type InventoryRow = {
  id: string;
  code: string;
  status: string;
  startedAt: string;
  closedAt: string | null;
  warehouseName: string | null;
  startedByName: string | null;
  items: number;
  counted: number;
  divergences: number;
};

type Suggestion = {
  productId: string;
  name: string;
  reference: string;
  sku: string;
  colorName: string | null;
  sizeName: string | null;
  stockQty: string;
  lowStock: number;
  suggested: number;
  costPrice: string;
  sold60d: number;
};

type InventoryDetail = {
  count: { id: string; code: string; status: string; notes: string | null; startedAt: string };
  items: Array<{
    id: string;
    variantId: string;
    expectedQty: string;
    countedQty: string | null;
    sku: string;
    colorName: string | null;
    sizeName: string | null;
    productName: string;
    reference: string;
    costPrice: string;
  }>;
};

type Tab = "POSICOES" | "MOVIMENTOS" | "INVENTARIO" | "REPOSICAO";

export function StockView({
  data,
  filters,
  categories,
  warehouses,
  permissions,
}: {
  data: {
    overview: {
      variantsInStock: number;
      variantsTotal: number;
      units: number;
      valueCost: string;
      valueSale: string;
      lowStock: number;
      outOfStock: number;
    };
    positions: {
      items: Position[];
      total: number;
      totals: { units: string; value: string };
      page: number;
      pageSize: number;
    };
    movements: {
      items: Movement[];
      total: number;
      totals: { entries: string; exits: string };
      page: number;
      pageSize: number;
    };
    inventories: InventoryRow[];
    suggestions: Suggestion[];
    warehouses: Array<{ id: string; name: string }>;
  };
  filters: { search: string; situation: string; categoryId: string; from: string; to: string };
  categories: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string }>;
  permissions: { canAdjust: boolean; canTransfer: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = React.useState<Tab>("POSICOES");
  const [search, setSearch] = React.useState(filters.search);
  const [saving, setSaving] = React.useState(false);

  // modais
  const [entryOpen, setEntryOpen] = React.useState(false);
  const [lossOpen, setLossOpen] = React.useState(false);
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [historyTarget, setHistoryTarget] = React.useState<Position | null>(null);
  const [history, setHistory] = React.useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [inventoryDetail, setInventoryDetail] = React.useState<InventoryDetail | null>(null);
  const [inventoryLoading, setInventoryLoading] = React.useState(false);

  /* --------------------------- entrada --------------------------- */
  const [entryItems, setEntryItems] = React.useState<
    Array<{ variant: VariantOption; quantity: number; unitCost: number }>
  >([]);
  const [entryReason, setEntryReason] = React.useState("");
  const [entryType, setEntryType] = React.useState<"PURCHASE" | "RETURN" | "OPENING">("PURCHASE");

  /* --------------------------- perda --------------------------- */
  const [lossVariant, setLossVariant] = React.useState<VariantOption | null>(null);
  const [lossQty, setLossQty] = React.useState(1);
  const [lossType, setLossType] = React.useState<"LOSS" | "DAMAGE">("LOSS");
  const [lossReason, setLossReason] = React.useState("");

  /* --------------------------- ajuste --------------------------- */
  const [adjustVariant, setAdjustVariant] = React.useState<VariantOption | null>(null);
  const [adjustQty, setAdjustQty] = React.useState(0);
  const [adjustReason, setAdjustReason] = React.useState("");

  /* --------------------------- transferência --------------------------- */
  const [fromWh, setFromWh] = React.useState(warehouses[0]?.id ?? "");
  const [toWh, setToWh] = React.useState(warehouses[1]?.id ?? "");
  const [transferItems, setTransferItems] = React.useState<Array<{ variant: VariantOption; quantity: number }>>([]);
  const [transferNotes, setTransferNotes] = React.useState("");

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, situation: filters.situation, ...patch } as Record<string, unknown>;
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined || value === "" || value === "ALL") continue;
      if (key === "search" || key === "situation" || key === "categoryId" || key === "from" || key === "to" || key === "page") {
        next.set(key, String(value));
      }
    }
    router.push(`/estoque?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) navigate({ search, page: undefined });
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function submitEntry() {
    if (!entryItems.length) return toast.error("Adicione ao menos um item.");
    if (entryReason.trim().length < 3) return toast.error("Informe a observação da entrada.");
    setSaving(true);
    try {
      await api.post("/api/stock/entry", {
        type: entryType,
        reason: entryReason,
        items: entryItems.map((i) => ({
          variantId: i.variant.variantId,
          quantity: i.quantity,
          unitCost: i.unitCost || undefined,
        })),
      });
      toast.success(`Entrada registrada com ${entryItems.length} item(ns).`);
      setEntryOpen(false);
      setEntryItems([]);
      setEntryReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitLoss() {
    if (!lossVariant) return toast.error("Selecione o produto.");
    if (lossQty <= 0) return toast.error("Informe a quantidade.");
    if (lossReason.trim().length < 3) return toast.error("Descreva o motivo da baixa.");
    setSaving(true);
    try {
      await api.post("/api/stock/loss", {
        variantId: lossVariant.variantId,
        quantity: lossQty,
        type: lossType,
        reason: lossReason,
      });
      toast.success("Baixa registrada no histórico.");
      setLossOpen(false);
      setLossVariant(null);
      setLossQty(1);
      setLossReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjust() {
    if (!adjustVariant) return toast.error("Selecione o produto.");
    if (adjustQty < 0) return toast.error("O saldo não pode ser negativo.");
    if (adjustReason.trim().length < 3) return toast.error("Informe o motivo do ajuste.");
    setSaving(true);
    try {
      await api.post("/api/stock/adjust", {
        variantId: adjustVariant.variantId,
        newQuantity: adjustQty,
        reason: adjustReason,
      });
      toast.success("Estoque ajustado.");
      setAdjustOpen(false);
      setAdjustVariant(null);
      setAdjustReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitTransfer() {
    if (!fromWh || !toWh) return toast.error("Selecione os depósitos.");
    if (fromWh === toWh) return toast.error("Origem e destino devem ser diferentes.");
    if (!transferItems.length) return toast.error("Adicione ao menos um item.");
    setSaving(true);
    try {
      await api.post("/api/stock/transfer", {
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        notes: transferNotes || undefined,
        items: transferItems.map((i) => ({ variantId: i.variant.variantId, quantity: i.quantity })),
      });
      toast.success("Transferência registrada.");
      setTransferOpen(false);
      setTransferItems([]);
      setTransferNotes("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(position: Position) {
    setHistoryTarget(position);
    setHistoryLoading(true);
    try {
      const result = await api.get<{ items: Movement[] }>("/api/stock/movements", {
        variantId: position.variantId,
        pageSize: 60,
      });
      setHistory(result.items);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openInventory(id: string) {
    setInventoryLoading(true);
    setInventoryDetail({ count: { id, code: "", status: "", notes: null, startedAt: "" }, items: [] });
    try {
      const result = await api.get<InventoryDetail>("/api/stock/inventory", { id });
      setInventoryDetail(result);
    } catch (err) {
      toast.error(errorMessage(err));
      setInventoryDetail(null);
    } finally {
      setInventoryLoading(false);
    }
  }

  async function startInventory() {
    setSaving(true);
    try {
      const result = await api.post<{ count: { id: string; code: string } }>("/api/stock/inventory", {
        warehouseId: warehouses[0]?.id,
        notes: `Inventário iniciado em ${today}`,
      });
      toast.success(`Inventário ${result.count.code} iniciado.`);
      router.refresh();
      void openInventory(result.count.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveCount(variantId: string, countedQty: number | null) {
    if (!inventoryDetail) return;
    try {
      await api.patch(`/api/stock/inventory/${inventoryDetail.count.id}/items`, {
        items: [{ variantId, countedQty }],
      });
      setInventoryDetail({
        ...inventoryDetail,
        items: inventoryDetail.items.map((i) =>
          i.variantId === variantId ? { ...i, countedQty: countedQty === null ? null : String(countedQty) } : i,
        ),
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function closeInventory() {
    if (!inventoryDetail) return;
    const pending = inventoryDetail.items.filter((i) => i.countedQty === null).length;
    if (pending > 0 && !confirm(`Ainda há ${pending} item(ns) sem contagem. Encerrar mesmo assim?`)) return;
    setSaving(true);
    try {
      const result = await api.post<{ adjusted: number }>(`/api/stock/inventory/${inventoryDetail.count.id}/close`, {
        applyAdjustments: true,
      });
      toast.success(`Inventário encerrado — ${result.adjusted} ajuste(s) aplicado(s).`);
      setInventoryDetail(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /* --------------------------- colunas --------------------------- */
  const positionColumns: Column<Position>[] = [
    {
      key: "product",
      header: "Produto",
      sortable: true,
      sortValue: (p) => p.productName,
      cell: (p) => (
        <div className="min-w-0">
          <Link href={`/produtos/${p.productId}`} className="truncate text-[13px] font-semibold hover:underline">
            {p.productName}
          </Link>
          <p className="text-[10px] text-[var(--text-muted)]">
            {p.reference} · {p.sku}
          </p>
        </div>
      ),
    },
    {
      key: "variant",
      header: "Grade",
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.colorName && <Badge tone="neutral">{p.colorName}</Badge>}
          {p.sizeName && <Badge tone="info">{p.sizeName}</Badge>}
          {!p.colorName && !p.sizeName && <span className="text-[10px] text-[var(--text-muted)]">Único</span>}
        </div>
      ),
      hiddenOnMobile: true,
    },
    {
      key: "stock",
      header: "Saldo",
      align: "right",
      sortable: true,
      sortValue: (p) => Number(p.stockQty),
      cell: (p) => {
        const qty = Number(p.stockQty);
        let tone = "text-[var(--text-primary)]";
        if (qty <= 0) tone = "text-[var(--danger)] font-bold";
        else if (qty <= p.lowStock) tone = "text-[var(--warning)] font-semibold";
        return (
          <div className="text-right">
            <span className={cn("text-[13px] tabular-nums", tone)}>{num(qty)}</span>
            {Number(p.reservedQty) > 0 && (
              <p className="text-[9px] text-[var(--text-muted)]">reservado {num(p.reservedQty)}</p>
            )}
          </div>
        );
      },
    },
    {
      key: "cost",
      header: "Custo",
      align: "right",
      hiddenOnMobile: true,
      cell: (p) => <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{brl(p.costPrice)}</span>,
    },
    {
      key: "price",
      header: "Venda",
      align: "right",
      cell: (p) => <span className="text-[11px] font-semibold tabular-nums">{brl(p.salePrice)}</span>,
    },
    {
      key: "value",
      header: "Valor em estoque",
      align: "right",
      hiddenOnMobile: true,
      cell: (p) => <span className="text-[11px] tabular-nums">{brl(p.valueCost)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-0.5">
          <Button variant="ghost" size="icon-sm" title="Histórico" onClick={() => void openHistory(p)}>
            <History className="h-3.5 w-3.5" />
          </Button>
          {permissions.canAdjust && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Ajustar saldo"
              onClick={() => {
                setAdjustVariant({
                  variantId: p.variantId,
                  productId: p.productId,
                  name: p.productName,
                  reference: p.reference,
                  sku: p.sku,
                  barcode: p.barcode,
                  colorName: p.colorName,
                  sizeName: p.sizeName,
                  stockQty: p.stockQty,
                  costPrice: p.costPrice,
                  effectivePrice: p.salePrice,
                  categoryName: p.categoryName,
                });
                setAdjustQty(Number(p.stockQty));
                setAdjustReason("");
                setAdjustOpen(true);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const movementColumns: Column<Movement>[] = [
    {
      key: "date",
      header: "Data",
      sortable: true,
      sortValue: (m) => m.createdAt,
      cell: (m) => <span className="whitespace-nowrap text-[11px]">{dateTimeBR(m.createdAt)}</span>,
    },
    {
      key: "product",
      header: "Produto",
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold">{m.productName ?? "—"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {m.sku}
            {m.colorName ? ` · ${m.colorName}` : ""}
            {m.sizeName ? ` · ${m.sizeName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      cell: (m) => <Badge tone={Number(m.quantity) > 0 ? "success" : "danger"}>{STOCK_MOVEMENT_LABELS[m.type] ?? m.type}</Badge>,
      hiddenOnMobile: true,
    },
    {
      key: "quantity",
      header: "Qtd",
      align: "right",
      cell: (m) => (
        <span
          className={cn(
            "text-[12px] font-semibold tabular-nums",
            Number(m.quantity) > 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}
        >
          {Number(m.quantity) > 0 ? "+" : ""}
          {num(m.quantity)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Saldo",
      align: "right",
      hiddenOnMobile: true,
      cell: (m) => <span className="text-[11px] tabular-nums">{num(m.balanceAfter)}</span>,
    },
    {
      key: "reason",
      header: "Motivo / origem",
      cell: (m) => (
        <div className="max-w-[260px]">
          <p className="truncate text-[11px]">{m.reason ?? "—"}</p>
          <p className="text-[9px] text-[var(--text-muted)]">
            {m.userName ?? "sistema"}
            {m.referenceType ? ` · ${m.referenceType}` : ""}
          </p>
        </div>
      ),
      hiddenOnMobile: true,
    },
  ];

  const suggestionColumns: Column<Suggestion>[] = [
    {
      key: "product",
      header: "Produto",
      sortable: true,
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{s.name}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {s.sku}
            {s.colorName ? ` · ${s.colorName}` : ""}
            {s.sizeName ? ` · ${s.sizeName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "Saldo",
      align: "right",
      sortable: true,
      sortValue: (s) => Number(s.stockQty),
      cell: (s) => (
        <span className={cn("text-[12px] font-semibold tabular-nums", Number(s.stockQty) <= 0 ? "text-[var(--danger)]" : "text-[var(--warning)]")}>
          {num(s.stockQty)}
        </span>
      ),
    },
    {
      key: "min",
      header: "Mínimo",
      align: "right",
      hiddenOnMobile: true,
      cell: (s) => <span className="text-[11px] tabular-nums">{s.lowStock}</span>,
    },
    {
      key: "sold",
      header: "Vendidos 60d",
      align: "right",
      sortable: true,
      sortValue: (s) => s.sold60d,
      hiddenOnMobile: true,
      cell: (s) => <span className="text-[11px] tabular-nums">{s.sold60d}</span>,
    },
    {
      key: "suggested",
      header: "Sugestão",
      align: "right",
      cell: (s) => (
        <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--accent-strong)]">
          {s.suggested} un.
        </span>
      ),
    },
    {
      key: "cost",
      header: "Investimento",
      align: "right",
      hiddenOnMobile: true,
      cell: (s) => <span className="text-[11px] tabular-nums">{brl(s.suggested * Number(s.costPrice))}</span>,
    },
  ];

  const overviewCards = [
    { label: "Unidades em estoque", value: num(data.overview.units), icon: Boxes, tone: "text-[var(--info)]" },
    { label: "Valor a custo", value: brl(data.overview.valueCost), icon: DollarSign, tone: "text-[var(--accent-strong)]" },
    { label: "Valor a venda", value: brl(data.overview.valueSale), icon: TrendingDown, tone: "text-[var(--success)]" },
    { label: "Abaixo do mínimo", value: num(data.overview.lowStock), icon: AlertTriangle, tone: "text-[var(--warning)]" },
    { label: "Sem estoque", value: num(data.overview.outOfStock), icon: PackageX, tone: "text-[var(--danger)]" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(data.overview.variantsTotal)} variações cadastradas · {num(data.overview.variantsInStock)} com saldo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.canExport && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={() =>
                void downloadFile("/api/reports/stock/export", {
                  kind: "positions",
                  format: "csv",
                  situation: filters.situation,
                }).catch((e) => toast.error(errorMessage(e)))
              }
            >
              Exportar
            </Button>
          )}
          {permissions.canAdjust && (
            <>
              <Button variant="outline" size="sm" leftIcon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={() => setEntryOpen(true)}>
                Entrada
              </Button>
              <Button variant="outline" size="sm" leftIcon={<ArrowUpFromLine className="h-3.5 w-3.5" />} onClick={() => setLossOpen(true)}>
                Baixa
              </Button>
              <Button size="sm" leftIcon={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={() => void startInventory()} loading={saving}>
                Novo inventário
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {overviewCards.map((card) => (
          <Card key={card.label} className="flex items-center gap-3 p-3">
            <div className={cn("rounded-lg bg-[var(--bg-muted)] p-2", card.tone)}>
              <card.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{card.label}</p>
              <p className="truncate text-sm font-bold tabular-nums">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "POSICOES", label: "Posições", count: data.positions.total },
          { value: "MOVIMENTOS", label: "Movimentações", count: data.movements.total },
          { value: "INVENTARIO", label: "Inventário", count: data.inventories.length },
          { value: "REPOSICAO", label: "Reposição", count: data.suggestions.length },
        ]}
      />

      {tab === "POSICOES" && (
        <>
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Buscar" className="min-w-[220px] flex-1">
                <SearchInput value={search} onChange={setSearch} placeholder="Produto, referência, SKU ou código..." />
              </Field>
              <Field label="Situação" className="w-40">
                <Select value={filters.situation} onChange={(e) => navigate({ situation: e.target.value, page: undefined })}>
                  <option value="ALL">Todas</option>
                  <option value="OK">Saudável</option>
                  <option value="LOW">Abaixo do mínimo</option>
                  <option value="OUT">Sem estoque</option>
                </Select>
              </Field>
              <Field label="Categoria" className="w-48">
                <Select value={filters.categoryId} onChange={(e) => navigate({ categoryId: e.target.value, page: undefined })}>
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <DataTable
            data={data.positions.items}
            columns={positionColumns}
            keyExtractor={(p) => p.variantId}
            pagination={{
              page: data.positions.page,
              pageSize: data.positions.pageSize,
              total: data.positions.total,
              onPageChange: (page) => navigate({ page }),
            }}
            footer={
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-muted)]">
                <span>
                  Unidades listadas: <strong className="text-[var(--text-primary)]">{num(data.positions.totals.units)}</strong>
                </span>
                <span>
                  Valor a custo: <strong className="text-[var(--text-primary)]">{brl(data.positions.totals.value)}</strong>
                </span>
              </div>
            }
            emptyState={
              <EmptyState
                icon={<Boxes className="h-6 w-6" />}
                title="Nenhuma variação encontrada"
                description="Ajuste os filtros ou cadastre produtos com grade de cor e tamanho."
                action={
                  permissions.canAdjust ? (
                    <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEntryOpen(true)}>
                      Registrar entrada
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </>
      )}

      {tab === "MOVIMENTOS" && (
        <DataTable
          data={data.movements.items}
          columns={movementColumns}
          keyExtractor={(m) => m.id}
          pagination={{
            page: data.movements.page,
            pageSize: data.movements.pageSize,
            total: data.movements.total,
            onPageChange: (page) => navigate({ page }),
          }}
          footer={
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-muted)]">
              <span>
                Entradas: <strong className="text-[var(--success)]">{num(data.movements.totals.entries)}</strong>
              </span>
              <span>
                Saídas: <strong className="text-[var(--danger)]">{num(data.movements.totals.exits)}</strong>
              </span>
            </div>
          }
          emptyState={
            <EmptyState
              icon={<History className="h-6 w-6" />}
              title="Sem movimentações"
              description="Vendas, entradas e ajustes alimentam este histórico automaticamente."
            />
          }
        />
      )}

      {tab === "INVENTARIO" && (
        <>
          <Alert tone="info" title="Como funciona o inventário">
            O inventário fotografa o saldo atual, permite digitar a contagem física e, ao encerrar, gera os ajustes de
            estoque com histórico completo (nada é apagado).
          </Alert>
          <Card className="overflow-hidden">
            {data.inventories.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="h-6 w-6" />}
                title="Nenhum inventário realizado"
                description="Inicie um inventário para conferir fisicamente o estoque da loja."
                action={
                  permissions.canAdjust ? (
                    <Button size="sm" onClick={() => void startInventory()} loading={saving}>
                      Novo inventário
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {data.inventories.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => void openInventory(inv.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-muted)]"
                  >
                    <ClipboardCheck className="h-4 w-4 text-[var(--text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">
                        {inv.code} · {inv.warehouseName}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {dateTimeBR(inv.startedAt)} · {inv.startedByName ?? "—"}
                        {inv.closedAt ? ` · encerrado ${dateTimeBR(inv.closedAt)}` : ""}
                      </p>
                    </div>
                    <Badge tone={inv.status === "OPEN" ? "warning" : "neutral"}>
                      {inv.status === "OPEN" ? "Em andamento" : "Encerrado"}
                    </Badge>
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                      {inv.counted}/{inv.items} contados
                      {inv.divergences > 0 && (
                        <strong className="ml-1 text-[var(--danger)]">· {inv.divergences} divergência(s)</strong>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "REPOSICAO" && (
        <>
          <Alert tone="warning" title="Reposição sugerida">
            Itens no ou abaixo do estoque mínimo. A sugestão considera repor o dobro do mínimo e prioriza os mais
            vendidos nos últimos 60 dias.
          </Alert>
          <DataTable
            data={data.suggestions}
            columns={suggestionColumns}
            keyExtractor={(s) => s.sku}
            emptyState={
              <EmptyState
                icon={<Layers className="h-6 w-6" />}
                title="Nenhuma reposição necessária"
                description="Todos os itens estão acima do estoque mínimo configurado."
              />
            }
          />
        </>
      )}

      {/* ---------------- modal: entrada ---------------- */}
      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Entrada de estoque"
        description="Compras, devoluções de clientes e saldo inicial"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEntryOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={() => void submitEntry()}>
              Registrar entrada
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" required>
              <Select value={entryType} onChange={(e) => setEntryType(e.target.value as never)}>
                <option value="PURCHASE">Entrada por compra</option>
                <option value="RETURN">Devolução de cliente</option>
                <option value="OPENING">Saldo inicial</option>
              </Select>
            </Field>
            <Field label="Observação" required>
              <Input value={entryReason} onChange={(e) => setEntryReason(e.target.value)} placeholder="Ex.: NF 1234 - Confecções Bella" />
            </Field>
          </div>

          <VariantPicker
            onSelect={(variant) =>
              setEntryItems((prev) => {
                if (prev.some((i) => i.variant.variantId === variant.variantId)) {
                  toast.info("Item já adicionado.");
                  return prev;
                }
                return [...prev, { variant, quantity: 1, unitCost: Number(variant.costPrice) }];
              })
            }
          />

          {entryItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
              <table className="w-full text-[12px]">
                <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-2 py-2 text-right">Qtd</th>
                    <th className="px-2 py-2 text-right">Custo un.</th>
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {entryItems.map((item, idx) => (
                    <tr key={item.variant.variantId} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-2">
                        <p className="font-semibold">{item.variant.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {item.variant.sku}
                          {item.variant.colorName ? ` · ${item.variant.colorName}` : ""}
                          {item.variant.sizeName ? ` · ${item.variant.sizeName}` : ""}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            setEntryItems((prev) =>
                              prev.map((i, n) => (n === idx ? { ...i, quantity: Number(e.target.value) } : i)),
                            )
                          }
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <MoneyInput
                          value={item.unitCost}
                          onChange={(v) =>
                            setEntryItems((prev) => prev.map((i, n) => (n === idx ? { ...i, unitCost: v } : i)))
                          }
                          className="w-28"
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">
                        {brl(item.quantity * item.unitCost)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEntryItems((prev) => prev.filter((_, n) => n !== idx))}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[var(--bg-muted)]">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-[11px] font-semibold">
                      Total da entrada
                    </td>
                    <td className="px-2 py-2 text-right text-[13px] font-bold tabular-nums">
                      {brl(entryItems.reduce((acc, i) => acc + i.quantity * i.unitCost, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* ---------------- modal: baixa ---------------- */}
      <Modal
        open={lossOpen}
        onClose={() => setLossOpen(false)}
        title="Baixa de estoque"
        description="Perdas, avarias e itens descartados"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLossOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" loading={saving} onClick={() => void submitLoss()}>
              Registrar baixa
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {lossVariant ? (
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] p-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold">{lossVariant.name}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {lossVariant.sku} · saldo {num(lossVariant.stockQty)}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setLossVariant(null)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <VariantPicker onSelect={setLossVariant} autoFocus />
          )}
          <Field label="Motivo do lançamento">
            <Select value={lossType} onChange={(e) => setLossType(e.target.value as never)}>
              <option value="LOSS">Perda / extravio</option>
              <option value="DAMAGE">Avaria / defeito</option>
            </Select>
          </Field>
          <Field label="Quantidade" required>
            <Input type="number" min={1} value={lossQty} onChange={(e) => setLossQty(Number(e.target.value))} />
          </Field>
          <Field label="Justificativa" required>
            <Textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="Ex.: manchado na exposição" />
          </Field>
        </div>
      </Modal>

      {/* ---------------- modal: ajuste ---------------- */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Ajustar saldo"
        description="Corrige o saldo do item com registro de auditoria"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={() => void submitAdjust()}>
              Salvar ajuste
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {adjustVariant && (
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-xs">
              <p className="font-semibold">{adjustVariant.name}</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {adjustVariant.sku} · saldo atual {num(adjustVariant.stockQty)}
              </p>
            </div>
          )}
          <Field label="Novo saldo" required>
            <Input type="number" min={0} value={adjustQty} onChange={(e) => setAdjustQty(Number(e.target.value))} />
          </Field>
          {adjustVariant && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Diferença:{" "}
              <strong
                className={cn(
                  adjustQty - Number(adjustVariant.stockQty) > 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
                )}
              >
                {adjustQty - Number(adjustVariant.stockQty) > 0 ? "+" : ""}
                {num(adjustQty - Number(adjustVariant.stockQty))} un.
              </strong>
            </p>
          )}
          <Field label="Motivo" required>
            <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Ex.: erro de digitação na entrada" />
          </Field>
        </div>
      </Modal>

      {/* ---------------- modal: transferência ---------------- */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transferir entre depósitos"
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={() => void submitTransfer()}>
              Transferir
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Origem" required>
              <Select value={fromWh} onChange={(e) => setFromWh(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Destino" required>
              <Select value={toWh} onChange={(e) => setToWh(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <VariantPicker
            onSelect={(v) =>
              setTransferItems((prev) =>
                prev.some((i) => i.variant.variantId === v.variantId) ? prev : [...prev, { variant: v, quantity: 1 }],
              )
            }
          />
          {transferItems.length > 0 && (
            <div className="space-y-1.5">
              {transferItems.map((item, idx) => (
                <div key={item.variant.variantId} className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold">{item.variant.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{item.variant.sku}</p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      setTransferItems((prev) => prev.map((i, n) => (n === idx ? { ...i, quantity: Number(e.target.value) } : i)))
                    }
                    className="w-20 text-right"
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => setTransferItems((prev) => prev.filter((_, n) => n !== idx))}>
                    <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Field label="Observações">
            <Input value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* ---------------- modal: histórico do item ---------------- */}
      <Modal
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title={historyTarget?.productName ?? "Histórico"}
        description={historyTarget ? `${historyTarget.sku} · saldo atual ${num(historyTarget.stockQty)}` : undefined}
        size="lg"
        footer={
          <Button variant="outline" size="sm" onClick={() => setHistoryTarget(null)}>
            Fechar
          </Button>
        }
      >
        {historyLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Carregando histórico...</p>
        ) : history.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="Sem movimentações" description="Este item ainda não teve entradas ou saídas." />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {history.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                <ArrowRightLeft className={cn("h-3.5 w-3.5 shrink-0", Number(m.quantity) > 0 ? "text-[var(--success)]" : "text-[var(--danger)]")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium">{STOCK_MOVEMENT_LABELS[m.type] ?? m.type}</p>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">
                    {dateTimeBR(m.createdAt)} · {m.userName ?? "sistema"} · {m.reason ?? "sem observação"}
                  </p>
                </div>
                <span className={cn("text-[12px] font-bold tabular-nums", Number(m.quantity) > 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                  {Number(m.quantity) > 0 ? "+" : ""}
                  {num(m.quantity)}
                </span>
                <span className="w-14 text-right text-[10px] text-[var(--text-muted)]">saldo {num(m.balanceAfter)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ---------------- modal: inventário ---------------- */}
      <Modal
        open={Boolean(inventoryDetail)}
        onClose={() => setInventoryDetail(null)}
        title={inventoryDetail?.count.code ?? "Inventário"}
        description={
          inventoryDetail?.count.status === "OPEN"
            ? "Digite a quantidade contada. Salva automaticamente ao sair do campo."
            : "Inventário encerrado — somente leitura."
        }
        size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setInventoryDetail(null)}>
              Fechar
            </Button>
            {inventoryDetail?.count.status === "OPEN" && permissions.canAdjust && (
              <Button size="sm" loading={saving} onClick={() => void closeInventory()}>
                Encerrar e ajustar estoque
              </Button>
            )}
          </>
        }
      >
        {inventoryLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Carregando itens...</p>
        ) : inventoryDetail ? (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[var(--bg-surface)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th className="py-1.5 text-left">Produto</th>
                  <th className="py-1.5 text-right">Sistema</th>
                  <th className="py-1.5 text-right">Contado</th>
                  <th className="py-1.5 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {inventoryDetail.items.map((item) => {
                  const diff = item.countedQty === null ? null : Number(item.countedQty) - Number(item.expectedQty);
                  return (
                    <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                      <td className="py-1.5">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {item.sku}
                          {item.sizeName ? ` · ${item.sizeName}` : ""}
                        </p>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{num(item.expectedQty)}</td>
                      <td className="py-1.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={item.countedQty ?? ""}
                          disabled={inventoryDetail.count.status !== "OPEN"}
                          onBlur={(e) => {
                            const value = e.target.value === "" ? null : Number(e.target.value);
                            if (value !== (item.countedQty === null ? null : Number(item.countedQty))) {
                              void saveCount(item.variantId, value);
                            }
                          }}
                          className="w-20 text-right"
                          placeholder="—"
                        />
                      </td>
                      <td
                        className={cn(
                          "py-1.5 text-right tabular-nums font-semibold",
                          diff === null ? "text-[var(--text-muted)]" : diff > 0 ? "text-[var(--success)]" : diff < 0 ? "text-[var(--danger)]" : "",
                        )}
                      >
                        {diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>

      {permissions.canTransfer && tab === "POSICOES" && (
        <div className="no-print">
          <Button variant="ghost" size="sm" leftIcon={<ArrowRightLeft className="h-3.5 w-3.5" />} onClick={() => setTransferOpen(true)}>
            Transferir entre depósitos
          </Button>
        </div>
      )}
    </div>
  );
}
