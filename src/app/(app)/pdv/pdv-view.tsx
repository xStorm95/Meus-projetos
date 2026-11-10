"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Minus, Trash2, User, UserPlus, CreditCard, Banknote, QrCode, Wallet,
  Check, X, ShoppingBag, Percent, Printer, Save, AlertTriangle, Loader2, ScanBarcode,
  ChevronsRight, PackageOpen, Receipt, Sparkles, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, num, maskDocument, maskPhone, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, Modal, EmptyState, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, SearchInput, Textarea } from "@/components/ui/form";

type VariantResult = {
  variantId: string;
  productId: string;
  name: string;
  reference: string;
  sku: string;
  barcode: string | null;
  colorName: string | null;
  sizeName: string | null;
  effectivePrice: string;
  listPrice: string;
  costPrice: string;
  available: number;
  isPromo: boolean;
  categoryName: string | null;
};

type CartLine = {
  variantId: string;
  name: string;
  sku: string;
  colorName: string | null;
  sizeName: string | null;
  unitPrice: number;
  listPrice: number;
  quantity: number;
  discountAmount: number;
  available: number;
  isPromo: boolean;
};

type Payment = {
  method: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "TRANSFER" | "OTHER";
  amount: number;
  tenderedAmount: number;
  installments: number;
  firstDueDate: string;
};

type Customer = { id: string; name: string; phone: string | null; document: string | null; creditLimit?: string };

const PAYMENT_OPTIONS = [
  { value: "CASH", label: "Dinheiro", icon: Banknote },
  { value: "PIX", label: "Pix", icon: QrCode },
  { value: "DEBIT", label: "Débito", icon: CreditCard },
  { value: "CREDIT", label: "Crédito", icon: CreditCard },
  { value: "STORE_CREDIT", label: "Crediário", icon: Wallet },
] as const;

export function PdvView({
  sellerId,
  sellerName,
  maxDiscount,
  canUnlimitedDiscount,
  settings,
  openSales,
  permissions,
}: {
  sellerId: string;
  sellerName: string;
  maxDiscount: number;
  canUnlimitedDiscount: boolean;
  settings: { requireDiscountReason: boolean; creditInterestRate: string };
  openSales: Array<{ id: string; number: number; total: string; customerName: string | null; itemCount: number }>;
  permissions: { canCancel: boolean; canDiscount: boolean };
}) {
  const router = useRouter();

  /* --------- estados --------- */
  const [searchTerm, setSearchTerm] = React.useState("");
  const [results, setResults] = React.useState<VariantResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [showResults, setShowResults] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [discountPercent, setDiscountPercent] = React.useState(0);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [discountMode, setDiscountMode] = React.useState<"percent" | "amount">("percent");
  const [discountReason, setDiscountReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [customerModalOpen, setCustomerModalOpen] = React.useState(false);
  const [openSalesModal, setOpenSalesModal] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [lastSale, setLastSale] = React.useState<{ id: string; number: number; change: string } | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);

  /* --------- totais (cálculo local espelhando o servidor) --------- */
  const subtotal = lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
  const itemDiscounts = lines.reduce((acc, l) => acc + l.discountAmount, 0);
  const manualDiscount = discountMode === "percent"
    ? (subtotal * discountPercent) / 100
    : discountAmount;
  const totalDiscount = itemDiscounts + manualDiscount;
  const total = Math.max(0, subtotal - totalDiscount);
  const effectiveDiscountPercent = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;
  const totalItems = lines.reduce((acc, l) => acc + l.quantity, 0);
  const paidTotal = payments.reduce((acc, p) => acc + p.amount, 0);
  const change = Math.max(0, paidTotal - total);
  const remaining = Math.max(0, total - paidTotal);

  const discountExceeded = !canUnlimitedDiscount && effectiveDiscountPercent > maxDiscount + 0.001;

  /* --------- busca de produtos --------- */
  React.useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get<{ items: VariantResult[] }>("/api/products/search", {
          q: searchTerm.trim(),
          limit: 20,
        });
        setResults(res.items);
        setHighlighted(0);
        setShowResults(true);
        // Código de barras exato com 1 resultado: adiciona direto
        if (res.items.length === 1) {
          const only = res.items[0];
          if (only.barcode === searchTerm.trim() || only.sku === searchTerm.trim().toUpperCase()) {
            addToCart(only);
            setSearchTerm("");
            setShowResults(false);
          }
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  function addToCart(variant: VariantResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variant.variantId);
      if (existing) {
        if (existing.quantity + 1 > variant.available) {
          toast.warning(`Estoque disponível: ${variant.available} un. de ${variant.name}.`);
          return prev;
        }
        return prev.map((l) =>
          l.variantId === variant.variantId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      if (variant.available <= 0) {
        toast.warning(`${variant.name} está sem estoque disponível.`);
        return prev;
      }
      return [
        ...prev,
        {
          variantId: variant.variantId,
          name: variant.name,
          sku: variant.sku,
          colorName: variant.colorName,
          sizeName: variant.sizeName,
          unitPrice: Number(variant.effectivePrice),
          listPrice: Number(variant.listPrice),
          quantity: 1,
          discountAmount: 0,
          available: variant.available,
          isPromo: variant.isPromo,
        },
      ];
    });
    setSearchTerm("");
    setShowResults(false);
    searchRef.current?.focus();
  }

  function updateLine(variantId: string, patch: Partial<CartLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.variantId !== variantId) return l;
        const next = { ...l, ...patch };
        if (next.quantity > l.available) {
          toast.warning(`Estoque disponível: ${l.available} un.`);
          next.quantity = l.available;
        }
        if (next.quantity < 1) next.quantity = 1;
        if (next.discountAmount > next.unitPrice * next.quantity) {
          next.discountAmount = next.unitPrice * next.quantity;
        }
        return next;
      }),
    );
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function clearSale() {
    setLines([]);
    setCustomer(null);
    setDiscountAmount(0);
    setDiscountPercent(0);
    setDiscountReason("");
    setNotes("");
    setPayments([]);
  }

  /* --------- teclado --------- */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F1") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F4") {
        e.preventDefault();
        setCustomerModalOpen(true);
      }
      if (e.key === "F6") {
        e.preventDefault();
        if (lines.length === 0) {
          toast.error("Adicione produtos antes de registrar o pagamento.");
          return;
        }
        setPaymentOpen(true);
      }
      if (e.key === "F8") {
        e.preventDefault();
        void saveOpenSale();
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (lines.length === 0) return;
        setPaymentOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, payments, total]);

  function validateBeforeSave(): boolean {
    if (lines.length === 0) {
      toast.error("Adicione ao menos um produto.");
      return false;
    }
    if (discountExceeded) {
      toast.error(`Desconto acima do limite de ${maxDiscount}% do seu perfil.`);
      return false;
    }
    if (totalDiscount > 0 && settings.requireDiscountReason && !discountReason.trim()) {
      toast.error("Informe o motivo do desconto aplicado.");
      return false;
    }
    return true;
  }

  function buildPayload(includePayments: boolean) {
    return {
      customerId: customer?.id ?? null,
      sellerId,
      items: lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
      })),
      discountPercent: discountMode === "percent" ? discountPercent : 0,
      discountAmount: discountMode === "amount" ? discountAmount : 0,
      discountReason: discountReason || undefined,
      notes: notes || undefined,
      payments: includePayments
        ? payments.filter((p) => p.amount > 0).map((p) => ({
            method: p.method,
            amount: p.amount,
            installments: p.method === "CREDIT" || p.method === "STORE_CREDIT" ? p.installments : 1,
            tenderedAmount: p.method === "CASH" && p.tenderedAmount > 0 ? p.tenderedAmount : undefined,
            firstDueDate: p.firstDueDate || undefined,
          }))
        : [],
    };
  }

  async function saveOpenSale() {
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const res = await api.post<{ sale: { id: string; number: number } }>("/api/sales", {
        ...buildPayload(false),
        saveAsOpen: true,
      });
      toast.success(`Venda #${res.sale.number} salva em aberto. Você pode retomá-la depois.`);
      clearSale();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function finalizeSale() {
    if (!validateBeforeSave()) return;
    if (paidTotal + 0.005 < total) {
      toast.error(`Faltam ${brl(remaining)} para completar o pagamento.`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{
        sale: { id: string; number: number; total: string };
        change: string;
      }>("/api/sales", buildPayload(true));
      toast.success(`Venda #${res.sale.number} finalizada com sucesso!`);
      setPaymentOpen(false);
      clearSale();
      router.refresh();
      setLastSale({ id: res.sale.id, number: res.sale.number, change: res.change });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function addPayment(method: Payment["method"]) {
    const remainingValue = Math.max(0, total - payments.reduce((a, p) => a + p.amount, 0));
    setPayments((prev) => [
      ...prev,
      {
        method,
        amount: Number(remainingValue.toFixed(2)),
        tenderedAmount: 0,
        installments: 1,
        firstDueDate: "",
      },
    ]);
  }

  const searchInput = (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        ref={searchRef}
        autoFocus
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[highlighted]) addToCart(results[highlighted]);
          } else if (e.key === "Escape") {
            setShowResults(false);
          }
        }}
        placeholder="Bipe o código de barras ou digite nome / referência / SKU do produto..."
        className="field h-12 pl-10 pr-24 text-sm"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {searching && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />}
        <span className="kbd">F1</span>
      </div>

      {showResults && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowResults(false)} />
          <div className="animate-scale-in absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[420px] overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl">
            {results.map((r, i) => (
              <button
                key={r.variantId}
                onClick={() => addToCart(r)}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-[var(--border-default)] px-3 py-2 text-left last:border-0",
                  highlighted === i ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--bg-muted)]",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{r.name}</p>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">
                    {r.sku} · {[r.colorName, r.sizeName].filter(Boolean).join(" / ") || "único"}
                    {r.barcode ? ` · ${r.barcode}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold tabular-nums">{brl(r.effectivePrice)}</p>
                  {r.isPromo && <p className="text-[9px] text-[var(--text-muted)] line-through">{brl(r.listPrice)}</p>}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    r.available <= 0
                      ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                      : r.available <= 3
                        ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                        : "bg-[var(--success-soft)] text-[var(--success)]",
                  )}
                >
                  {r.available} un.
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {showResults && searchTerm.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-center shadow-xl">
          <p className="text-xs text-[var(--text-muted)]">
            Nenhum produto encontrado para “{searchTerm}”.
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            Verifique a grafia ou cadastre um novo produto.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Nova venda
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Vendedor: {sellerName} · {totalItems} item(ns) · limite de desconto {num(maxDiscount, 0)}%
          </p>
        </div>
        <div className="flex gap-2">
          {openSales.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Clock className="h-3.5 w-3.5" />}
              onClick={() => setOpenSalesModal(true)}
            >
              Em aberto ({openSales.length})
            </Button>
          )}
          <Link href="/vendas">
            <Button variant="outline" size="sm" leftIcon={<Receipt className="h-3.5 w-3.5" />}>
              Histórico
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px]">
        {/* -------- coluna esquerda: itens -------- */}
        <div className="space-y-3">
          {searchInput}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Itens da venda
              </p>
              {lines.length > 0 && (
                <button onClick={clearSale} className="text-[11px] font-semibold text-[var(--danger)] hover:underline">
                  Limpar venda
                </button>
              )}
            </div>

            {lines.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="h-6 w-6" />}
                title="Nenhum item na venda"
                description="Bipe o código de barras ou busque o produto pelo nome, referência ou SKU. Use as setas para navegar e Enter para adicionar."
              />
            ) : (
              <div className="divide-y divide-[var(--border-default)]">
                {lines.map((line) => (
                  <div key={line.variantId} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {line.name}
                        {line.isPromo && <Badge tone="rose" className="ml-1.5 px-1 py-0 text-[9px]">Promo</Badge>}
                      </p>
                      <p className="truncate text-[10px] text-[var(--text-muted)]">
                        {line.sku}
                        {line.colorName ? ` · ${line.colorName}` : ""}
                        {line.sizeName ? ` · ${line.sizeName}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center rounded-lg border border-[var(--border-default)]">
                      <button
                        onClick={() => updateLine(line.variantId, { quantity: line.quantity - 1 })}
                        className="px-2 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                        aria-label="Diminuir"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={line.available}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.variantId, { quantity: Number(e.target.value) })}
                        className="w-11 border-x border-[var(--border-default)] bg-transparent py-1 text-center text-xs font-semibold tabular-nums outline-none"
                      />
                      <button
                        onClick={() => updateLine(line.variantId, { quantity: line.quantity + 1 })}
                        className="px-2 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                        aria-label="Aumentar"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.variantId, { unitPrice: Number(e.target.value) })}
                        className="field h-8 py-0 text-right text-xs tabular-nums"
                        title="Preço unitário"
                      />
                    </div>

                    <div className="w-20">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={line.discountAmount}
                        onChange={(e) => updateLine(line.variantId, { discountAmount: Number(e.target.value) })}
                        className="field h-8 py-0 text-right text-xs tabular-nums"
                        placeholder="desc."
                        title="Desconto no item (R$)"
                      />
                    </div>

                    <p className="w-20 text-right text-xs font-bold tabular-nums">
                      {brl(line.unitPrice * line.quantity - line.discountAmount)}
                    </p>

                    <button
                      onClick={() => removeLine(line.variantId)}
                      className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Observações da venda">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: presente para embalar, retirada posterior..."
                />
              </Field>
              <Field label="Motivo do desconto" hint="Obrigatório quando houver desconto">
                <Input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="Ex.: cliente fidelidade, promoção do dia"
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* -------- coluna direita: resumo -------- */}
        <div className="space-y-3">
          <Card className="p-3">
            <button
              onClick={() => setCustomerModalOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-muted)]">
                <User className="h-4 w-4 text-[var(--text-secondary)]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">
                  {customer?.name ?? "Consumidor não identificado"}
                </span>
                <span className="block truncate text-[10px] text-[var(--text-muted)]">
                  {customer ? [customer.document, customer.phone].filter(Boolean).join(" · ") || "Cliente selecionado" : "Clique para identificar o cliente (F4)"}
                </span>
              </span>
              {customer ? (
                <X
                  className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomer(null);
                  }}
                />
              ) : (
                <UserPlus className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              )}
            </button>
          </Card>

          <Card className="p-4">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Subtotal</span>
                <span className="font-medium tabular-nums">{brl(subtotal)}</span>
              </div>
              {itemDiscounts > 0 && (
                <div className="flex justify-between text-[var(--warning)]">
                  <span>Desconto nos itens</span>
                  <span className="font-medium tabular-nums">- {brl(itemDiscounts)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Desconto na venda</span>
                <div className="flex items-center gap-1">
                  <div className="flex rounded-md border border-[var(--border-default)] p-0.5">
                    <button
                      onClick={() => setDiscountMode("percent")}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold",
                        discountMode === "percent" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)]",
                      )}
                    >
                      %
                    </button>
                    <button
                      onClick={() => setDiscountMode("amount")}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold",
                        discountMode === "amount" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)]",
                      )}
                    >
                      R$
                    </button>
                  </div>
                  {discountMode === "percent" ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="field h-7 w-16 py-0 text-right text-xs tabular-nums"
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(Number(e.target.value))}
                      className="field h-7 w-20 py-0 text-right text-xs tabular-nums"
                    />
                  )}
                </div>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-[var(--warning)]">
                  <span>Total de descontos ({num(effectiveDiscountPercent, 1)}%)</span>
                  <span className="font-medium tabular-nums">- {brl(totalDiscount)}</span>
                </div>
              )}
              <div className="!mt-3 flex items-end justify-between border-t border-[var(--border-default)] pt-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  Total
                </span>
                <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {brl(total)}
                </span>
              </div>
            </div>

            {discountExceeded && (
              <Alert tone="danger" className="mt-2">
                Desconto de {num(effectiveDiscountPercent, 1)}% excede o limite de{" "}
                {num(maxDiscount, 0)}% do seu perfil.
              </Alert>
            )}

            <div className="mt-3 space-y-1.5">
              <Button
                className="w-full"
                size="lg"
                disabled={lines.length === 0}
                onClick={() => setPaymentOpen(true)}
                leftIcon={<CreditCard className="h-4 w-4" />}
              >
                Finalizar venda (F9)
              </Button>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={lines.length === 0}
                  loading={saving}
                  onClick={() => void saveOpenSale()}
                  leftIcon={<Save className="h-3.5 w-3.5" />}
                >
                  Em aberto (F8)
                </Button>
                {/* A página /orcamentos/novo nunca existiu: orçamento é criado
                    no modal da lista de orçamentos. Link corrigido. */}
                <Link href="/orcamentos">
                  <Button variant="outline" size="sm" className="w-full" leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
                    Orçamento
                  </Button>
                </Link>
              </div>
            </div>

            <p className="mt-2 text-center text-[9px] text-[var(--text-muted)]">
              F1 buscar · F4 cliente · F6/F9 pagamento · F8 em aberto
            </p>
          </Card>

          <Card className="p-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Atalhos rápidos
            </p>
            <div className="flex flex-wrap gap-1">
              {[
                { label: "Identificar cliente", action: () => setCustomerModalOpen(true) },
                { label: "Vendas em aberto", action: () => setOpenSalesModal(true) },
                { label: "Buscar produto", action: () => searchRef.current?.focus() },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={a.action}
                  className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* -------- modal de cliente -------- */}
      <CustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onSelect={(c) => {
          setCustomer(c);
          setCustomerModalOpen(false);
        }}
        selected={customer}
      />

      {/* -------- modal de pagamento -------- */}
      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={total}
        payments={payments}
        setPayments={setPayments}
        customer={customer}
        onConfirm={() => void finalizeSale()}
        saving={saving}
        onAdd={(m) => addPayment(m)}
        creditInterestRate={settings.creditInterestRate}
      />

      {/* -------- modal de vendas em aberto -------- */}
      <OpenSalesModal
        open={openSalesModal}
        onClose={() => setOpenSalesModal(false)}
        sales={openSales}
        onRecover={(sale) => {
          setOpenSalesModal(false);
          router.push(`/pdv?retomar=${sale.id}`);
        }}
      />

      {/* -------- comprovante -------- */}
      <Modal
        open={Boolean(lastSale)}
        onClose={() => setLastSale(null)}
        title="Venda finalizada"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLastSale(null)}>
              Nova venda
            </Button>
            {lastSale && (
              <a href={`/api/sales/${lastSale.id}/receipt`} target="_blank" rel="noreferrer">
                <Button size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />}>
                  Imprimir comprovante
                </Button>
              </a>
            )}
          </>
        }
      >
        <div className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-soft)]">
            <Check className="h-7 w-7 text-[var(--success)]" />
          </div>
          <p className="mt-3 text-sm font-semibold">Venda #{lastSale?.number} concluída</p>
          <p className="text-xs text-[var(--text-muted)]">
            O estoque foi atualizado e o financeiro registrado automaticamente.
          </p>
          {lastSale && Number(lastSale.change) > 0 && (
            <div className="mt-3 rounded-xl bg-[var(--accent-soft)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">Troco</p>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--accent)]">
                {brl(lastSale.change)}
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ================== MODAL DE CLIENTE ================== */
function CustomerModal({
  open,
  onClose,
  onSelect,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (c: Customer) => void;
  selected: Customer | null;
}) {
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDoc, setNewDoc] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [saveLoading, setSaveLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setTerm("");
      setResults([]);
      setCreating(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || term.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get<{ items: Customer[] }>("/api/customers", { search: term, pageSize: 10 });
        setResults(res.items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [term, open]);

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setSaveLoading(true);
    try {
      const res = await api.post<{ customer: Customer }>("/api/customers", {
        name: newName.trim(),
        document: newDoc || null,
        phone: newPhone || null,
        whatsapp: newPhone || null,
      });
      onSelect(res.customer);
      toast.success("Cliente cadastrado e vinculado à venda.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Identificar cliente" size="md">
      {!creating ? (
        <div className="space-y-3">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Nome, CPF, telefone ou e-mail..."
            autoFocus
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {loading && <p className="py-4 text-center text-xs text-[var(--text-muted)]">Buscando...</p>}
            {!loading && term.length >= 2 && results.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">Nenhum cliente encontrado.</p>
                <Button size="sm" className="mt-2" onClick={() => setCreating(true)} leftIcon={<UserPlus className="h-3.5 w-3.5" />}>
                  Cadastrar novo cliente
                </Button>
              </div>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-[var(--bg-muted)]",
                  selected?.id === c.id && "bg-[var(--accent-soft)]",
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-muted)] text-[10px] font-bold">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{c.name}</span>
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">
                    {[c.document, c.phone].filter(Boolean).join(" · ") || "Sem documento/telefone"}
                  </span>
                </span>
              </button>
            ))}
            {term.length < 2 && (
              <div className="py-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  Digite para buscar ou cadastre um novo cliente.
                </p>
                <div className="mt-2 flex justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCreating(true)} leftIcon={<UserPlus className="h-3.5 w-3.5" />}>
                    Novo cliente
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onClose}>
                    Vender sem identificar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Nome completo" required>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus placeholder="Maria Silva" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="CPF">
              <Input
                value={newDoc}
                onChange={(e) => setNewDoc(maskDocument(e.target.value))}
                placeholder="000.000.000-00"
              />
            </Field>
            <Field label="Celular / WhatsApp">
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
              />
            </Field>
          </div>
          <Alert tone="info">
            O cadastro rápido cria o cliente direto no banco. Você pode completar os dados depois
            em Clientes.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Voltar</Button>
            <Button size="sm" loading={saveLoading} onClick={() => void handleCreate()}>
              Cadastrar e usar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ================== MODAL DE PAGAMENTO ================== */
function PaymentModal({
  open,
  onClose,
  total,
  payments,
  setPayments,
  customer,
  onConfirm,
  saving,
  onAdd,
  creditInterestRate,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  customer: Customer | null;
  onConfirm: () => void;
  saving: boolean;
  onAdd: (m: Payment["method"]) => void;
  creditInterestRate: string;
}) {
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const needsCustomer = payments.some((p) => p.method === "STORE_CREDIT");

  function update(index: number, patch: Partial<Payment>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function remove(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pagamento"
      description={`Total a pagar: ${brl(total)}`}
      size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            loading={saving}
            disabled={remaining > 0.005 || needsCustomer ? !customer && payments.some((p) => p.method === "STORE_CREDIT") : false}
            onClick={onConfirm}
            leftIcon={<Check className="h-4 w-4" />}
          >
            Confirmar venda
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5">
          {PAYMENT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = payments.some((p) => p.method === opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onAdd(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-2.5 transition-all",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-muted)]",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] py-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">
              Selecione uma ou mais formas de pagamento acima.
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              É possível dividir o valor entre formas diferentes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p, index) => {
              const opt = PAYMENT_OPTIONS.find((o) => o.value === p.method);
              const installmentValue = p.installments > 1 ? p.amount / p.installments : p.amount;
              return (
                <div key={`${p.method}-${index}`} className="rounded-xl border border-[var(--border-default)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-semibold">{opt?.label}</span>
                    <div className="w-28">
                      <MoneyInput
                        value={p.amount}
                        onChange={(v) => {
                          if (p.method === "CASH") {
                            update(index, { amount: v, tenderedAmount: Math.max(p.tenderedAmount, v) });
                          } else {
                            update(index, { amount: v });
                          }
                        }}
                        className="h-8 py-0 text-xs"
                      />
                    </div>
                    <button
                      onClick={() => remove(index)}
                      className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      aria-label="Remover pagamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {p.method === "CASH" && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)]">Valor entregue:</span>
                      <div className="w-24">
                        <MoneyInput
                          value={p.tenderedAmount}
                          onChange={(v) => update(index, { tenderedAmount: v, amount: v })}
                          className="h-7 py-0 text-[11px]"
                        />
                      </div>
                      {p.tenderedAmount > p.amount && (
                        <span className="text-[10px] font-semibold text-[var(--success)]">
                          Troco: {brl(p.tenderedAmount - p.amount)}
                        </span>
                      )}
                    </div>
                  )}

                  {(p.method === "CREDIT" || p.method === "STORE_CREDIT") && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)]">Parcelas:</span>
                      <Select
                        value={p.installments}
                        onChange={(e) => update(index, { installments: Number(e.target.value) })}
                        className="h-7 w-20 py-0 text-[11px]"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </Select>
                      {p.installments > 1 && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          12x de <strong>{brl(installmentValue)}</strong>
                        </span>
                      )}
                      {p.method === "STORE_CREDIT" && (
                        <>
                          <span className="text-[10px] text-[var(--text-muted)] ml-auto">1º vencimento:</span>
                          <input
                            type="date"
                            value={p.firstDueDate || todayISO()}
                            onChange={(e) => update(index, { firstDueDate: e.target.value })}
                            className="field h-7 w-32 py-0 text-[11px]"
                          />
                        </>
                      )}
                    </div>
                  )}

                  {p.method === "STORE_CREDIT" && p.installments > 1 && (
                    <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                      Crediário próprio: a taxa de juros configurada é de {creditInterestRate}% ao mês
                      e só é aplicada em caso de atraso ou renegociação.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {needsCustomer && !customer && (
          <Alert tone="warning" title="Cliente obrigatório">
            Vendas no crediário exigem identificação do cliente com CPF. Use o botão de cliente (F4).
          </Alert>
        )}

        <div className="rounded-xl bg-[var(--bg-muted)] p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Total da venda</span>
            <span className="font-semibold tabular-nums">{brl(total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Valor informado</span>
            <span className="font-semibold tabular-nums">{brl(paid)}</span>
          </div>
          {remaining > 0.005 && (
            <div className="mt-1 flex justify-between border-t border-[var(--border-default)] pt-1 text-[var(--danger)]">
              <span className="font-semibold">Falta</span>
              <span className="font-bold tabular-nums">{brl(remaining)}</span>
            </div>
          )}
          {change > 0.005 && (
            <div className="mt-1 flex justify-between border-t border-[var(--border-default)] pt-1 text-[var(--success)]">
              <span className="font-semibold">Troco</span>
              <span className="font-bold tabular-nums">{brl(change)}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ================== MODAL VENDAS EM ABERTO ================== */
function OpenSalesModal({
  open,
  onClose,
  sales,
  onRecover,
}: {
  open: boolean;
  onClose: () => void;
  sales: Array<{ id: string; number: number; total: string; customerName: string | null; itemCount: number }>;
  onRecover: (sale: { id: string }) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Vendas em aberto" size="md">
      {sales.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-6 w-6" />}
          title="Nenhuma venda em aberto"
          description="Vendas salvas sem finalizar aparecem aqui para serem retomadas."
        />
      ) : (
        <ul className="space-y-1.5">
          {sales.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onRecover(s)}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-default)] px-3 py-2 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    Venda #{s.number} · {s.customerName ?? "Sem cliente"}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{s.itemCount} item(ns)</p>
                </div>
                <span className="text-xs font-bold tabular-nums">{brl(s.total)}</span>
                <ChevronsRight className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

void Percent;
void AlertTriangle;
void ScanBarcode;
