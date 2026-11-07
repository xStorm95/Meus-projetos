"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Package, Copy, Pencil, Trash2, AlertTriangle, Upload, Download, Tag, Search,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { SearchInput, Select, Field } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, Badge, ConfirmDialog } from "@/components/ui/primitives";

type ProductRow = {
  id: string;
  name: string;
  reference: string;
  barcode: string | null;
  salePrice: string;
  costPrice: string;
  promoPrice: string | null;
  status: "ACTIVE" | "INACTIVE";
  lowStock: number;
  images: string[];
  hasVariants: boolean;
  isKit: boolean;
  categoryName: string | null;
  brandName: string | null;
  stock: number;
  variantCount: number;
};

export function ProductsView({
  initial,
  categories,
  brands,
  filters,
  canCreate,
  canEdit,
  canDelete,
}: {
  initial: { items: ProductRow[]; total: number; page: number; pageSize: number };
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  filters: { search: string; stockFilter: string; categoryId: string; status: string };
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(filters.search);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ProductRow | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  function applyFilters(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === "all") next.delete(key);
      else next.set(key, String(value));
    }
    if (!("page" in patch)) next.delete("page");
    router.push(`/produtos?${next.toString()}`);
  }

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (search !== filters.search) applyFilters({ search });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDuplicate(product: ProductRow) {
    setLoading(true);
    try {
      const res = await api.post<{ product: { id: string } }>(`/api/products/${product.id}/duplicate`);
      toast.success("Produto duplicado com sucesso.");
      router.push(`/produtos/${res.product.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete<{ action: "deleted" | "deactivated" }>(`/api/products/${deleting.id}`);
      toast.success(
        res.action === "deleted"
          ? "Produto excluído."
          : "Produto possui histórico — foi inativado com segurança.",
      );
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<ProductRow>[] = [
    {
      key: "product",
      header: "Produto",
      sortable: true,
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-muted)]">
            {p.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-4 w-4 text-[var(--text-muted)]" />
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/produtos/${p.id}`}
              className="block truncate text-[13px] font-semibold hover:text-[var(--accent)]"
            >
              {p.name}
            </Link>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-muted)]">Ref. {p.reference}</span>
              {p.isKit && <Badge tone="rose" className="px-1 py-0 text-[9px]">Kit</Badge>}
              {p.status === "INACTIVE" && <Badge tone="neutral" className="px-1 py-0 text-[9px]">Inativo</Badge>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      hiddenOnMobile: true,
      cell: (p) => (
        <span className="text-xs text-[var(--text-secondary)]">
          {p.categoryName ?? "—"}
          {p.brandName && <span className="block text-[10px] text-[var(--text-muted)]">{p.brandName}</span>}
        </span>
      ),
    },
    {
      key: "variants",
      header: "Grade",
      align: "center",
      hiddenOnMobile: true,
      cell: (p) => <span className="text-xs tabular-nums text-[var(--text-secondary)]">{p.variantCount}</span>,
    },
    {
      key: "stock",
      header: "Estoque",
      align: "right",
      sortable: true,
      sortValue: (p) => p.stock,
      cell: (p) => (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
            p.stock <= 0
              ? "text-[var(--danger)]"
              : p.stock <= p.lowStock
                ? "text-[var(--warning)]"
                : "text-[var(--text-primary)]",
          )}
        >
          {(p.stock <= p.lowStock) && <AlertTriangle className="h-3 w-3" />}
          {num(p.stock)}
        </span>
      ),
    },
    {
      key: "price",
      header: "Preço de venda",
      align: "right",
      sortable: true,
      sortValue: (p) => Number(p.salePrice),
      cell: (p) => (
        <div className="text-right">
          <p className="text-xs font-semibold tabular-nums">{brl(p.promoPrice ?? p.salePrice)}</p>
          {p.promoPrice && (
            <p className="text-[10px] text-[var(--text-muted)] line-through">{brl(p.salePrice)}</p>
          )}
        </div>
      ),
    },
    {
      key: "margin",
      header: "Margem",
      align: "right",
      hiddenOnMobile: true,
      cell: (p) => {
        const sale = Number(p.promoPrice ?? p.salePrice);
        const cost = Number(p.costPrice);
        const margin = sale > 0 ? ((sale - cost) / sale) * 100 : 0;
        return (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              margin < 20 ? "text-[var(--danger)]" : margin < 40 ? "text-[var(--warning)]" : "text-[var(--success)]",
            )}
          >
            {num(margin, 0)}%
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <div className="flex items-center justify-end gap-0.5">
          <Link href={`/produtos/${p.id}/etiquetas`} title="Etiquetas">
            <Button variant="ghost" size="icon-sm"><Tag className="h-3.5 w-3.5" /></Button>
          </Link>
          {canEdit && (
            <Button variant="ghost" size="icon-sm" title="Duplicar" onClick={() => void handleDuplicate(p)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && (
            <Link href={`/produtos/${p.id}/editar`} title="Editar">
              <Button variant="ghost" size="icon-sm"><Pencil className="h-3.5 w-3.5" /></Button>
            </Link>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Excluir/inativar"
              onClick={() => setDeleting(p)}
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
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
            Produtos
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(initial.total)} produto(s) cadastrado(s) · grade de cores e tamanhos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() => void downloadFile("/api/products/export", { format: "csv", search: filters.search }).catch((e) => toast.error(errorMessage(e)))}
          >
            Exportar
          </Button>
          {canCreate && (
            <>
              <Link href="/produtos/importar">
                <Button variant="outline" size="sm" leftIcon={<Upload className="h-3.5 w-3.5" />}>
                  Importar
                </Button>
              </Link>
              <Link href="/produtos/novo">
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />}>Novo produto</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Buscar" className="min-w-[220px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Nome, referência, SKU ou código de barras..." />
          </Field>
          <Field label="Categoria" className="w-40">
            <Select
              value={filters.categoryId}
              onChange={(e) => applyFilters({ categoryId: e.target.value })}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Marca" className="w-36">
            <Select value="" onChange={(e) => applyFilters({ brandId: e.target.value })}>
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estoque" className="w-36">
            <Select value={filters.stockFilter} onChange={(e) => applyFilters({ stockFilter: e.target.value })}>
              <option value="all">Todos</option>
              <option value="available">Com estoque</option>
              <option value="low">Estoque baixo</option>
              <option value="out">Sem estoque</option>
            </Select>
          </Field>
          <Field label="Status" className="w-32">
            <Select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })}>
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </Select>
          </Field>
        </div>
      </Card>

      <DataTable
        data={initial.items}
        columns={columns}
        loading={loading}
        keyExtractor={(p) => p.id}
        pagination={{
          page: initial.page,
          pageSize: initial.pageSize,
          total: initial.total,
          onPageChange: (page) => applyFilters({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nenhum produto encontrado"
            description={
              filters.search || filters.categoryId
                ? "Ajuste os filtros ou tente outro termo de busca."
                : "Cadastre o primeiro produto para começar a vender."
            }
            action={
              canCreate ? (
                <Link href="/produtos/novo">
                  <Button leftIcon={<Plus className="h-4 w-4" />}>Cadastrar produto</Button>
                </Link>
              ) : undefined
            }
          />
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
        title="Excluir produto"
        message={
          <>
            Deseja excluir <strong>{deleting?.name}</strong>?
            <br />
            <span className="mt-2 block text-xs text-[var(--text-muted)]">
              Se o produto já tiver vendas ou movimentações de estoque, ele será apenas{" "}
              <strong>inativado</strong> para preservar o histórico fiscal e contábil.
            </span>
          </>
        }
        confirmLabel="Excluir / inativar"
      />
    </div>
  );
}
