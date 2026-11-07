"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Package, AlertTriangle, TrendingUp, History, Tag, Boxes, Plus, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Modal, EmptyState, Alert } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/form";
import { STOCK_MOVEMENT_LABELS } from "@/lib/constants";

type Variant = {
  id: string;
  sku: string;
  barcode: string | null;
  colorName: string | null;
  sizeName: string | null;
  costPrice: string;
  salePrice: string;
  promoPrice: string | null;
  stockQty: string;
  reservedQty: string;
  lowStock: number | null;
  isActive: boolean;
};

type Detail = {
  product: {
    id: string;
    name: string;
    reference: string;
    barcode: string | null;
    description: string | null;
    images: string[];
    status: "ACTIVE" | "INACTIVE";
    costPrice: string;
    salePrice: string;
    promoPrice: string | null;
    lowStock: number;
    unit: string;
    material: string | null;
    composition: string | null;
    ncm: string | null;
    csosn: string | null;
    createdAt: string;
    isKit: boolean;
  };
  category: { name: string } | null;
  brand: { name: string } | null;
  collection: { name: string } | null;
  variants: Variant[];
  priceHistory: Array<{
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  kitItems: Array<{ id: string; quantity: string; sku: string; colorName: string | null; sizeName: string | null }>;
  totals: { stock: number; costValue: string; saleValue: string; margin: number };
};

export function ProductDetail({
  data,
  canEdit,
  canAdjustStock,
  canViewCost,
}: {
  data: Detail;
  canEdit: boolean;
  canAdjustStock: boolean;
  canViewCost: boolean;
}) {
  const router = useRouter();
  const [adjustVariant, setAdjustVariant] = React.useState<Variant | null>(null);
  const [historyVariant, setHistoryVariant] = React.useState<Variant | null>(null);
  const [history, setHistory] = React.useState<Array<Record<string, unknown>>>([]);
  const [newQty, setNewQty] = React.useState(0);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const colorGroups = React.useMemo(() => {
    const map = new Map<string, Variant[]>();
    for (const v of data.variants) {
      const key = v.colorName ?? "Sem cor";
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  }, [data.variants]);

  async function loadHistory(variant: Variant) {
    setHistoryVariant(variant);
    try {
      const res = await api.get<{ items: Array<Record<string, unknown>> }>(`/api/stock/movements`, {
        variantId: variant.id,
        pageSize: 50,
      });
      setHistory(res.items);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleAdjust() {
    if (!adjustVariant) return;
    if (!reason.trim()) {
      toast.error("Informe o motivo do ajuste.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/stock/adjust", {
        variantId: adjustVariant.id,
        newQuantity: newQty,
        reason,
      });
      toast.success("Estoque ajustado e movimentação registrada.");
      setAdjustVariant(null);
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/produtos">
            <Button variant="ghost" size="icon-sm" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
                {data.product.name}
              </h1>
              <Badge tone={data.product.status === "ACTIVE" ? "success" : "neutral"}>
                {data.product.status === "ACTIVE" ? "Ativo" : "Inativo"}
              </Badge>
              {data.product.isKit && <Badge tone="rose">Kit</Badge>}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Ref. {data.product.reference}
              {data.product.barcode && ` · EAN ${data.product.barcode}`}
              {data.category && ` · ${data.category.name}`}
              {data.brand && ` · ${data.brand.name}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/produtos/${data.product.id}/etiquetas`}>
            <Button variant="outline" size="sm" leftIcon={<Tag className="h-3.5 w-3.5" />}>
              Etiquetas
            </Button>
          </Link>
          {canEdit && (
            <Link href={`/produtos/${data.product.id}/editar`}>
              <Button size="sm" leftIcon={<Pencil className="h-3.5 w-3.5" />}>Editar produto</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="pt-4">
            <div className="aspect-square overflow-hidden rounded-xl bg-[var(--bg-muted)]">
              {data.product.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.product.images[0]} alt={data.product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="h-10 w-10 text-[var(--text-muted)]" />
                </div>
              )}
            </div>
            {data.product.images.length > 1 && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {data.product.images.slice(1, 5).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={img} alt="" className="aspect-square rounded-lg object-cover" />
                ))}
              </div>
            )}
            <div className="mt-4 space-y-2 text-xs">
              <Row label="Preço de venda" value={brl(data.product.promoPrice ?? data.product.salePrice)} strong />
              {data.product.promoPrice && (
                <Row label="Preço normal" value={brl(data.product.salePrice)} strike />
              )}
              {canViewCost && <Row label="Custo" value={brl(data.product.costPrice)} />}
              {canViewCost && (
                <Row
                  label="Margem"
                  value={`${num(data.totals.margin)}%`}
                  tone={data.totals.margin < 20 ? "danger" : data.totals.margin < 40 ? "warning" : "success"}
                />
              )}
              <Row label="Estoque total" value={`${num(data.totals.stock)} un.`} />
              {canViewCost && <Row label="Valor em estoque (custo)" value={brl(data.totals.costValue)} />}
              {canViewCost && <Row label="Valor em estoque (venda)" value={brl(data.totals.saleValue)} />}
              <Row label="Estoque mínimo" value={`${num(data.product.lowStock)} un.`} />
              <Row label="Cadastrado em" value={dateTimeBR(data.product.createdAt)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {(data.product.material || data.product.composition || data.product.description) && (
            <Card>
              <CardHeader><CardTitle>Descrição</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                {data.product.description && <p className="leading-relaxed">{data.product.description}</p>}
                {data.product.material && (
                  <p><strong className="text-[var(--text-primary)]">Material:</strong> {data.product.material}</p>
                )}
                {data.product.composition && (
                  <p><strong className="text-[var(--text-primary)]">Composição:</strong> {data.product.composition}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Grade de variações</CardTitle>
                <CardDescription>
                  {data.variants.length} variação(ões) · estoque por cor e tamanho
                </CardDescription>
              </div>
              {canAdjustStock && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Boxes className="h-3.5 w-3.5" />}
                  onClick={() => {
                    toast.info("Use a página de Estoque para ajustes em lote ou clique em uma variação.");
                  }}
                >
                  Ajustar estoque
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {data.variants.length === 0 ? (
                <EmptyState title="Sem variações" description="Este produto não possui variações cadastradas." />
              ) : (
                colorGroups.map(([colorName, variants]) => (
                  <div key={colorName} className="rounded-xl border border-[var(--border-default)]">
                    <div className="flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-muted)]/60 px-3 py-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide">{colorName}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {num(variants.reduce((a, v) => a + Number(v.stockQty), 0))} un.
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--border-default)]">
                      {variants.map((v) => {
                        const low = Number(v.stockQty) <= (v.lowStock ?? data.product.lowStock);
                        return (
                          <div key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <span className="flex h-7 min-w-9 items-center justify-center rounded-md border border-[var(--border-default)] px-1.5 text-[11px] font-bold">
                              {v.sizeName ?? "Único"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-[11px] text-[var(--text-secondary)]">{v.sku}</p>
                              {v.barcode && (
                                <p className="font-mono text-[10px] text-[var(--text-muted)]">EAN {v.barcode}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className={cn(
                                "text-xs font-bold tabular-nums",
                                low ? (Number(v.stockQty) <= 0 ? "text-[var(--danger)]" : "text-[var(--warning)]") : "",
                              )}>
                                {num(v.stockQty)} un.
                                {Number(v.reservedQty) > 0 && (
                                  <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
                                    ({num(v.reservedQty)} res.)
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)]">{brl(v.promoPrice ?? v.salePrice)}</p>
                            </div>
                            {low && <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />}
                            <Button variant="ghost" size="icon-sm" title="Histórico" onClick={() => void loadHistory(v)}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            {canAdjustStock && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Ajustar estoque"
                                onClick={() => {
                                  setAdjustVariant(v);
                                  setNewQty(Number(v.stockQty));
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {data.kitItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Composição do kit</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs">
                  {data.kitItems.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>{[item.colorName, item.sizeName].filter(Boolean).join(" / ") || item.sku}</span>
                      <span className="font-semibold">{num(item.quantity)} un.</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Histórico de alterações de preço</CardTitle>
                <CardDescription>Auditoria de custos e preços de venda</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {data.priceHistory.length === 0 ? (
                <EmptyState title="Sem alterações de preço" description="O histórico aparece quando custos ou preços forem alterados." />
              ) : (
                <ul className="max-h-56 divide-y divide-[var(--border-default)] overflow-y-auto">
                  {data.priceHistory.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-2 text-[11px]">
                      <span className="text-[var(--text-muted)]">{dateTimeBR(h.createdAt)}</span>
                      <span className="flex-1 text-[var(--text-secondary)]">
                        {h.field === "costPrice" ? "Custo" : h.field === "salePrice" ? "Preço de venda" : "Promocional"}
                        {h.reason ? ` · ${h.reason}` : ""}
                      </span>
                      <span className="tabular-nums">
                        <span className="text-[var(--text-muted)] line-through">{brl(h.oldValue)}</span>
                        {" → "}
                        <strong>{brl(h.newValue)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ajuste de estoque */}
      <Modal
        open={Boolean(adjustVariant)}
        onClose={() => setAdjustVariant(null)}
        title="Ajustar estoque"
        description={adjustVariant ? `${adjustVariant.sku} · saldo atual ${num(adjustVariant.stockQty)} un.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAdjustVariant(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleAdjust()}>Confirmar ajuste</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning">
            O ajuste será registrado no histórico com seu usuário, data/hora e o motivo informado.
          </Alert>
          <Field label="Nova quantidade" required>
            <Input
              type="number"
              min={0}
              value={newQty}
              onChange={(e) => setNewQty(Number(e.target.value))}
            />
          </Field>
          <Field label="Motivo do ajuste" required>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: contagem de inventário, avaria, correção de lançamento"
            />
          </Field>
          {adjustVariant && newQty !== Number(adjustVariant.stockQty) && (
            <p className="text-xs text-[var(--text-secondary)]">
              Diferença:{" "}
              <strong className={newQty > Number(adjustVariant.stockQty) ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                {newQty > Number(adjustVariant.stockQty) ? "+" : ""}
                {num(newQty - Number(adjustVariant.stockQty))} un.
              </strong>
            </p>
          )}
        </div>
      </Modal>

      {/* Histórico da variação */}
      <Modal
        open={Boolean(historyVariant)}
        onClose={() => setHistoryVariant(null)}
        title="Histórico de movimentação"
        description={historyVariant?.sku}
        size="lg"
      >
        {history.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="Sem movimentações" description="Esta variação ainda não teve entradas ou saídas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th className="text-right">Qtd.</th>
                  <th className="text-right">Saldo</th>
                  <th>Origem / motivo</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={String(m.id)}>
                    <td className="whitespace-nowrap text-[11px]">{dateTimeBR(String(m.createdAt))}</td>
                    <td className="text-[11px]">{STOCK_MOVEMENT_LABELS[String(m.type)] ?? String(m.type)}</td>
                    <td className={cn(
                      "text-right text-[11px] font-semibold tabular-nums",
                      Number(m.quantity) > 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
                    )}>
                      {Number(m.quantity) > 0 ? "+" : ""}{num(String(m.quantity))}
                    </td>
                    <td className="text-right text-[11px] tabular-nums">{num(String(m.balanceAfter))}</td>
                    <td className="max-w-[240px] truncate text-[11px] text-[var(--text-muted)]">
                      {String(m.reason ?? m.referenceType ?? "—")}
                    </td>
                    <td className="text-[11px] text-[var(--text-muted)]">{String(m.userName ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  strike,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  strike?: boolean;
  tone?: "danger" | "warning" | "success";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "text-right tabular-nums",
          strong && "font-bold text-[var(--text-primary)]",
          strike && "line-through text-[var(--text-muted)]",
          tone === "danger" && "font-semibold text-[var(--danger)]",
          tone === "warning" && "font-semibold text-[var(--warning)]",
          tone === "success" && "font-semibold text-[var(--success)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

void TrendingUp;
void Printer;
