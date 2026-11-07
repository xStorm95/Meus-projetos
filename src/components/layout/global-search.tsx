"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Package, Users, Receipt, Truck, CornerDownLeft, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { brl, cn } from "@/lib/utils";

type SearchResult = {
  products: Array<{ id: string; name: string; reference: string; price: string; stock: number }>;
  customers: Array<{ id: string; name: string; phone: string | null; document: string | null }>;
  sales: Array<{ id: string; number: number; total: string; customerName: string | null }>;
  suppliers: Array<{ id: string; name: string }>;
};

const EMPTY: SearchResult = { products: [], customers: [], sales: [], suppliers: [] };

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<SearchResult>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setTerm("");
      setResults(EMPTY);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  React.useEffect(() => {
    if (!term.trim()) {
      setResults(EMPTY);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get<SearchResult>("/api/search", { q: term.trim() });
        setResults(res);
        setActiveIndex(0);
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timeout);
  }, [term]);

  type FlatItem = { label: string; sub: string; href: string; kind: string };
  const items: FlatItem[] = React.useMemo(() => {
    const list: FlatItem[] = [];
    for (const p of results.products)
      list.push({ label: p.name, sub: `Ref. ${p.reference} · ${brl(p.price)} · ${p.stock} un.`, href: `/produtos/${p.id}`, kind: "Produto" });
    for (const c of results.customers)
      list.push({ label: c.name, sub: [c.phone, c.document].filter(Boolean).join(" · "), href: `/clientes/${c.id}`, kind: "Cliente" });
    for (const s of results.sales)
      list.push({ label: `Venda #${s.number}`, sub: `${s.customerName ?? "Consumidor"} · ${brl(s.total)}`, href: `/vendas/${s.id}`, kind: "Venda" });
    for (const s of results.suppliers)
      list.push({ label: s.name, sub: "Fornecedor", href: `/fornecedores/${s.id}`, kind: "Fornecedor" });
    return list;
  }, [results]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault();
      go(items[activeIndex].href);
    }
  }

  const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    Produto: Package,
    Cliente: Users,
    Venda: Receipt,
    Fornecedor: Truck,
  };

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="-mx-5 -my-4">
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar por produto, referência, código de barras, cliente, CPF ou venda..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />}
          <span className="kbd">ESC</span>
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {!term.trim() ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-[var(--text-muted)]">
                Digite ao menos 2 caracteres para buscar em todo o sistema.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {["Vestido", "Calça jeans", "Maria", "Venda"].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setTerm(ex)}
                    className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
              Nenhum resultado para “{term}”.
            </div>
          ) : (
            <ul className="p-1.5">
              {items.map((item, idx) => {
                const Icon = groupIcons[item.kind] ?? Package;
                return (
                  <li key={`${item.kind}-${item.href}-${idx}`}>
                    <button
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(item.href)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                        activeIndex === idx ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--bg-muted)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{item.label}</span>
                        <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.sub}</span>
                      </span>
                      <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        {item.kind}
                      </span>
                      {activeIndex === idx && <CornerDownLeft className="h-3 w-3 text-[var(--text-muted)]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> navegar</span>
          <span className="flex items-center gap-1"><span className="kbd">↵</span> abrir</span>
          <span className="ml-auto">Busca global</span>
        </div>
      </div>
    </Modal>
  );
}
