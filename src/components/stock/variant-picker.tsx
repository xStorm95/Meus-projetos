"use client";

import * as React from "react";
import { Search, Plus, Loader2, Package, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { cn, brl, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { toast } from "sonner";

export type VariantOption = {
  variantId: string;
  productId: string;
  name: string;
  reference: string;
  sku: string;
  barcode: string | null;
  colorName: string | null;
  sizeName: string | null;
  stockQty: string;
  costPrice: string;
  effectivePrice: string;
  categoryName: string | null;
};

/**
 * Busca de variações (cor × tamanho) por nome, referência, SKU ou código de barras.
 * Usada em estoque, trocas, orçamentos e compras.
 */
export function VariantPicker({
  onSelect,
  placeholder = "Buscar por nome, SKU ou código de barras...",
  showStock = true,
  autoFocus = false,
}: {
  onSelect: (variant: VariantOption) => void;
  placeholder?: string;
  showStock?: boolean;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<VariantOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<{ items: VariantOption[] }>("/api/products/search", {
          q: term.trim(),
          limit: 15,
        });
        if (active) {
          setResults(data.items ?? []);
          setOpen(true);
        }
      } catch (err) {
        if (active) toast.error(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="pl-8 pr-8"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />}
        {!loading && term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Limpar busca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl">
          {results.map((variant) => (
            <button
              key={variant.variantId}
              type="button"
              onClick={() => {
                onSelect(variant);
                setTerm("");
                setResults([]);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-left last:border-0 hover:bg-[var(--bg-muted)]"
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold">{variant.name}</p>
                <p className="truncate text-[10px] text-[var(--text-muted)]">
                  {variant.sku}
                  {variant.colorName ? ` · ${variant.colorName}` : ""}
                  {variant.sizeName ? ` · ${variant.sizeName}` : ""}
                </p>
              </div>
              {showStock && (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    Number(variant.stockQty) > 0
                      ? "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                      : "bg-[var(--danger-soft)] text-[var(--danger)]",
                  )}
                >
                  {num(variant.stockQty)} un.
                </span>
              )}
              <span className="shrink-0 text-[11px] font-semibold tabular-nums">{brl(variant.effectivePrice)}</span>
              <Plus className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ButtonVariantPicker({ onSelect, label = "Adicionar item" }: { onSelect: (v: VariantOption) => void; label?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
        {label}
      </Button>
      {open && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2">
          <VariantPicker
            autoFocus
            onSelect={(v) => {
              onSelect(v);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
