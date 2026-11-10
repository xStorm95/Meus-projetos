"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Sparkles, Package, Palette, Ruler, Info, Save, X, ImagePlus, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, num, onlyDigits } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Alert, Badge } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, Textarea, Switch, Checkbox } from "@/components/ui/form";

type Ref = { id: string; name: string; hex?: string };
type Supplier = { id: string; legalName: string };

export type ProductFormData = {
  id?: string;
  name: string;
  reference?: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
  supplierId?: string | null;
  collectionId?: string | null;
  material?: string | null;
  composition?: string | null;
  costPrice: string;
  salePrice: string;
  promoPrice?: string | null;
  promoStartsAt?: string | null;
  promoEndsAt?: string | null;
  maxDiscountPercent?: string | null;
  lowStock?: number;
  images?: string[];
  status?: "ACTIVE" | "INACTIVE";
  showOnline?: boolean;
  notes?: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  csosn?: string | null;
  origin?: string;
  unit?: string;
  variants?: Array<{
    id?: string;
    colorId: string | null;
    sizeId: string | null;
    colorName: string | null;
    sizeName: string | null;
    sku: string;
    barcode: string | null;
    costPrice: string;
    salePrice: string;
    stockQty: string;
  }>;
};

type GridCell = {
  key: string;
  colorId: string | null;
  sizeId: string | null;
  colorName: string | null;
  sizeName: string | null;
  enabled: boolean;
  stock: number;
  cost: number;
  price: number;
  barcode: string;
};

/**
 * Os campos de seleção guardam "" quando nada foi escolhido (o <option> vazio),
 * mas a API espera null para "sem categoria/marca/fornecedor" — enviar "" faz o
 * Zod recusar com "Invalid uuid".
 */
function uuidOuNulo(valor?: string | null): string | null {
  const v = (valor ?? "").trim();
  return v === "" ? null : v;
}

export function ProductForm({
  mode,
  initial,
  categories,
  brands,
  colors,
  sizes,
  collections,
  suppliers,
  permissions,
}: {
  mode: "create" | "edit";
  initial?: ProductFormData;
  categories: Ref[];
  brands: Ref[];
  colors: Ref[];
  sizes: Ref[];
  collections: Ref[];
  suppliers: Supplier[];
  permissions: { canChangePrice: boolean; canAdjustStock: boolean };
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<"geral" | "grade" | "fiscal">("geral");

  const [form, setForm] = React.useState({
    name: initial?.name ?? "",
    reference: initial?.reference ?? "",
    barcode: initial?.barcode ?? "",
    description: initial?.description ?? "",
    categoryId: initial?.categoryId ?? "",
    subcategoryId: initial?.subcategoryId ?? "",
    brandId: initial?.brandId ?? "",
    supplierId: initial?.supplierId ?? "",
    collectionId: initial?.collectionId ?? "",
    material: initial?.material ?? "",
    composition: initial?.composition ?? "",
    costPrice: Number(initial?.costPrice ?? 0),
    salePrice: Number(initial?.salePrice ?? 0),
    promoPrice: initial?.promoPrice ? Number(initial.promoPrice) : ("" as number | ""),
    promoStartsAt: initial?.promoStartsAt ?? "",
    promoEndsAt: initial?.promoEndsAt ?? "",
    maxDiscountPercent: initial?.maxDiscountPercent ? Number(initial.maxDiscountPercent) : ("" as number | ""),
    lowStock: initial?.lowStock ?? 5,
    status: initial?.status ?? ("ACTIVE" as "ACTIVE" | "INACTIVE"),
    showOnline: initial?.showOnline ?? false,
    notes: initial?.notes ?? "",
    ncm: initial?.ncm ?? "",
    cest: initial?.cest ?? "",
    cfop: initial?.cfop ?? "",
    csosn: initial?.csosn ?? "102",
    origin: initial?.origin ?? "0",
    unit: initial?.unit ?? "UN",
  });

  const [images, setImages] = React.useState<string[]>(initial?.images ?? []);
  const [selectedColors, setSelectedColors] = React.useState<string[]>(() => {
    if (initial?.variants?.length) {
      return [...new Set(initial.variants.map((v) => v.colorId).filter(Boolean))] as string[];
    }
    return [];
  });
  const [selectedSizes, setSelectedSizes] = React.useState<string[]>(() => {
    if (initial?.variants?.length) {
      return [...new Set(initial.variants.map((v) => v.sizeId).filter(Boolean))] as string[];
    }
    return [];
  });
  const [cells, setCells] = React.useState<Record<string, GridCell>>({});
  const [newColorName, setNewColorName] = React.useState("");
  const [newSizeName, setNewSizeName] = React.useState("");
  const [colorList, setColorList] = React.useState(colors);
  const [sizeList, setSizeList] = React.useState(sizes);

  /* ---- Inicializa a grade a partir das variações existentes ---- */
  React.useEffect(() => {
    if (mode !== "edit" || !initial?.variants) return;
    const next: Record<string, GridCell> = {};
    for (const v of initial.variants) {
      const key = `${v.colorId ?? "none"}__${v.sizeId ?? "none"}`;
      next[key] = {
        key,
        colorId: v.colorId,
        sizeId: v.sizeId,
        colorName: v.colorName,
        sizeName: v.sizeName,
        enabled: true,
        stock: Number(v.stockQty),
        cost: Number(v.costPrice),
        price: Number(v.salePrice),
        barcode: v.barcode ?? "",
      };
    }
    setCells(next);
  }, [mode, initial]);

  /* ---- Reconstrói a grade quando cores/tamanhos mudam ---- */
  const gridKeys = React.useMemo(() => {
    const colorKeys: Array<{ id: string | null; name: string | null }> =
      selectedColors.length > 0
        ? selectedColors.map((id) => ({ id, name: colorList.find((c) => c.id === id)?.name ?? null }))
        : [{ id: null, name: null }];
    const sizeKeys: Array<{ id: string | null; name: string | null }> =
      selectedSizes.length > 0
        ? selectedSizes.map((id) => ({ id, name: sizeList.find((s) => s.id === id)?.name ?? null }))
        : [{ id: null, name: null }];
    return colorKeys.flatMap((c) =>
      sizeKeys.map((s) => ({
        key: `${c.id ?? "none"}__${s.id ?? "none"}`,
        colorId: c.id,
        sizeId: s.id,
        colorName: c.name,
        sizeName: s.name,
      })),
    );
  }, [selectedColors, selectedSizes, colorList, sizeList]);

  React.useEffect(() => {
    setCells((prev) => {
      const next: Record<string, GridCell> = {};
      for (const g of gridKeys) {
        next[g.key] =
          prev[g.key] ??
          {
            ...g,
            enabled: true,
            stock: 0,
            cost: form.costPrice,
            price: form.salePrice,
            barcode: "",
          };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridKeys]);

  const enabledCells = gridKeys.filter((g) => cells[g.key]?.enabled !== false);
  const totalStock = enabledCells.reduce((acc, g) => acc + (cells[g.key]?.stock ?? 0), 0);
  const totalCostValue = enabledCells.reduce(
    (acc, g) => acc + (cells[g.key]?.stock ?? 0) * (cells[g.key]?.cost ?? form.costPrice),
    0,
  );
  const totalSaleValue = enabledCells.reduce(
    (acc, g) => acc + (cells[g.key]?.stock ?? 0) * (cells[g.key]?.price ?? form.salePrice),
    0,
  );
  const margin = form.salePrice > 0 ? ((form.salePrice - form.costPrice) / form.salePrice) * 100 : 0;

  function updateCell(key: string, patch: Partial<GridCell>) {
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function toggleColor(id: string) {
    setSelectedColors((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }
  function toggleSize(id: string) {
    setSelectedSizes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function applyAllFromBase() {
    setCells((prev) => {
      const next = { ...prev };
      for (const g of gridKeys) {
        next[g.key] = {
          ...next[g.key],
          cost: form.costPrice,
          price: form.salePrice,
        };
      }
      return next;
    });
    toast.success("Custo e preço aplicados a toda a grade.");
  }

  async function handleAddColor() {
    if (!newColorName.trim()) return;
    try {
      const res = await api.post<{ item: Ref }>("/api/catalog/colors", {
        name: newColorName.trim(),
        hex: "#cccccc",
      });
      setColorList((l) => [...l, res.item]);
      setSelectedColors((prev) => [...prev, res.item.id]);
      setNewColorName("");
      toast.success("Cor adicionada.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleAddSize() {
    if (!newSizeName.trim()) return;
    try {
      const res = await api.post<{ item: Ref }>("/api/catalog/sizes", { name: newSizeName.trim() });
      setSizeList((l) => [...l, res.item]);
      setSelectedSizes((prev) => [...prev, res.item.id]);
      setNewSizeName("");
      toast.success("Tamanho adicionado.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function handleImageUpload(files: FileList | null) {
    if (!files) return;
    const remaining = 8 - images.length;
    Array.from(files)
      .slice(0, remaining)
      .forEach((file) => {
        if (file.size > 3 * 1024 * 1024) {
          toast.error(`${file.name}: imagem maior que 3 MB.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setImages((prev) => [...prev, result]);
        };
        reader.readAsDataURL(file);
      });
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do produto.");
      setTab("geral");
      return;
    }
    if (form.salePrice <= 0) {
      toast.error("Informe o preço de venda.");
      setTab("geral");
      return;
    }
    if (enabledCells.length === 0) {
      toast.error("Selecione ao menos uma cor ou tamanho na grade.");
      setTab("grade");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const payload = {
          ...form,
          categoryId: uuidOuNulo(form.categoryId),
          subcategoryId: uuidOuNulo(form.subcategoryId),
          brandId: uuidOuNulo(form.brandId),
          supplierId: uuidOuNulo(form.supplierId),
          collectionId: uuidOuNulo(form.collectionId),
          promoPrice: form.promoPrice === "" ? null : form.promoPrice,
          maxDiscountPercent: form.maxDiscountPercent === "" ? null : form.maxDiscountPercent,
          barcode: form.barcode || null,
          images,
          variants: enabledCells.map((g) => ({
            colorId: g.colorId,
            sizeId: g.sizeId,
            barcode: cells[g.key]?.barcode || null,
            costPrice: cells[g.key]?.cost ?? form.costPrice,
            salePrice: cells[g.key]?.price ?? form.salePrice,
            stockQty: cells[g.key]?.stock ?? 0,
          })),
        };
        const res = await api.post<{ product: { id: string } }>("/api/products", payload);
        toast.success("Produto cadastrado com sucesso.");
        router.push(`/produtos/${res.product.id}`);
      } else {
        const payload = {
          ...form,
          categoryId: uuidOuNulo(form.categoryId),
          subcategoryId: uuidOuNulo(form.subcategoryId),
          brandId: uuidOuNulo(form.brandId),
          supplierId: uuidOuNulo(form.supplierId),
          collectionId: uuidOuNulo(form.collectionId),
          promoPrice: form.promoPrice === "" ? null : form.promoPrice,
          maxDiscountPercent: form.maxDiscountPercent === "" ? null : form.maxDiscountPercent,
          barcode: form.barcode || null,
          images,
          variants: (initial?.variants ?? []).map((v) => {
            const key = `${v.colorId ?? "none"}__${v.sizeId ?? "none"}`;
            const cell = cells[key];
            return {
              id: v.id!,
              barcode: cell?.barcode ?? v.barcode,
              costPrice: cell?.cost ?? Number(v.costPrice),
              salePrice: cell?.price ?? Number(v.salePrice),
              stockQty: cell?.stock ?? Number(v.stockQty),
            };
          }),
        };
        await api.put(`/api/products/${initial!.id}`, payload);
        toast.success("Produto atualizado com sucesso.");
        router.push(`/produtos/${initial!.id}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const uniqueColors = [...new Set(gridKeys.map((g) => g.colorId ?? "none"))];

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {mode === "create" ? "Novo produto" : "Editar produto"}
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {mode === "create"
              ? "Cadastre o produto e monte a grade de cores e tamanhos."
              : `Editando ${initial?.name}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={mode === "edit" && initial?.id ? `/produtos/${initial.id}` : "/produtos"}>
            <Button type="button" variant="outline" size="sm">Cancelar</Button>
          </Link>
          <Button type="submit" size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />}>
            {mode === "create" ? "Cadastrar produto" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1">
        {[
          { id: "geral" as const, label: "Dados gerais", icon: <Package className="h-3.5 w-3.5" /> },
          { id: "grade" as const, label: `Grade (${enabledCells.length})`, icon: <Ruler className="h-3.5 w-3.5" /> },
          { id: "fiscal" as const, label: "Fiscal e observações", icon: <Info className="h-3.5 w-3.5" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              tab === t.id
                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)]",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "geral" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Identificação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do produto" required className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Calça Jeans Feminina Skinny"
                  required
                />
              </Field>
              <Field label="Referência" hint="Deixe vazio para gerar automaticamente">
                <Input
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="CALCA-JEANS-001"
                  disabled={mode === "edit"}
                />
              </Field>
              <Field label="Código de barras (EAN)" hint="Opcional no produto — cada variação tem o seu">
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="7891234567890"
                />
              </Field>
              <Field label="Categoria">
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Selecione</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Marca">
                <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                  <option value="">Selecione</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Coleção">
                <Select value={form.collectionId} onChange={(e) => setForm({ ...form, collectionId: e.target.value })}>
                  <option value="">Selecione</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fornecedor">
                <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Selecione</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.legalName}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Material">
                <Input
                  value={form.material}
                  onChange={(e) => setForm({ ...form, material: e.target.value })}
                  placeholder="Ex.: Jeans com elastano"
                />
              </Field>
              <Field label="Composição">
                <Input
                  value={form.composition}
                  onChange={(e) => setForm({ ...form, composition: e.target.value })}
                  placeholder="Ex.: 98% algodão, 2% elastano"
                />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detalhes do produto, dicas de lavagem, caimento..."
                />
              </Field>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Preços</CardTitle>
                  <CardDescription>Valores padrão aplicados a toda a grade</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Custo de aquisição" required>
                  <MoneyInput
                    value={form.costPrice}
                    onChange={(v) => setForm({ ...form, costPrice: v })}
                    disabled={!permissions.canChangePrice}
                  />
                </Field>
                <Field label="Preço de venda" required>
                  <MoneyInput
                    value={form.salePrice}
                    onChange={(v) => setForm({ ...form, salePrice: v })}
                    disabled={!permissions.canChangePrice}
                  />
                </Field>
                <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Margem de lucro
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      margin < 20 ? "text-[var(--danger)]" : margin < 40 ? "text-[var(--warning)]" : "text-[var(--success)]",
                    )}
                  >
                    {num(margin, 1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Lucro por peça
                  </span>
                  <span className="text-sm font-bold tabular-nums text-[var(--success)]">
                    {brl(form.salePrice - form.costPrice)}
                  </span>
                </div>
                <Field label="Preço promocional" hint="Aplicado enquanto a promoção estiver vigente">
                  <MoneyInput
                    value={form.promoPrice}
                    onChange={(v) => setForm({ ...form, promoPrice: v })}
                  />
                </Field>
                {form.promoPrice !== "" && form.promoPrice > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Início">
                      <Input
                        type="date"
                        value={form.promoStartsAt}
                        onChange={(e) => setForm({ ...form, promoStartsAt: e.target.value })}
                      />
                    </Field>
                    <Field label="Fim">
                      <Input
                        type="date"
                        value={form.promoEndsAt}
                        onChange={(e) => setForm({ ...form, promoEndsAt: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
                <Field label="Desconto máximo (%)" hint="Limite específico deste produto">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.maxDiscountPercent}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        maxDiscountPercent: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    placeholder="Usar padrão do sistema"
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Estoque e status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Estoque mínimo (alerta)" hint="Gera notificação quando atingir este nível">
                  <Input
                    type="number"
                    min={0}
                    value={form.lowStock}
                    onChange={(e) => setForm({ ...form, lowStock: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Unidade">
                  <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    <option value="UN">Unidade (UN)</option>
                    <option value="PC">Peça (PC)</option>
                    <option value="PAR">Par (PAR)</option>
                    <option value="KG">Quilograma (KG)</option>
                  </Select>
                </Field>
                <Switch
                  checked={form.status === "ACTIVE"}
                  onChange={(v) => setForm({ ...form, status: v ? "ACTIVE" : "INACTIVE" })}
                  label="Produto ativo"
                  description="Inativos não aparecem no PDV"
                />
                <Switch
                  checked={form.showOnline}
                  onChange={(v) => setForm({ ...form, showOnline: v })}
                  label="Exibir no catálogo online"
                  description="Preparado para integração com e-commerce"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fotos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border-default)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, ix) => ix !== i))}
                        className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remover foto"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {images.length < 8 && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      <ImagePlus className="h-4 w-4" />
                      <span className="text-[9px] font-medium">Adicionar</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => handleImageUpload(e.target.files)}
                      />
                    </label>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  Até 8 imagens, 3 MB cada. Armazenadas com o produto.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "grade" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[var(--accent)]" />
                  Cores disponíveis
                </CardTitle>
                <CardDescription>
                  Selecione as cores do produto — cada combinação terá estoque próprio
                </CardDescription>
              </div>
              <Badge tone="gold">{selectedColors.length} selecionada(s)</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {colorList.map((c) => {
                  const active = selectedColors.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleColor(c.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ background: c.hex ?? "#ccc" }}
                      />
                      {c.name}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1">
                  <input
                    value={newColorName}
                    onChange={(e) => setNewColorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddColor();
                      }
                    }}
                    placeholder="Nova cor..."
                    className="field h-8 w-28 py-0 text-[11px]"
                  />
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => void handleAddColor()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-[var(--accent)]" />
                  Tamanhos disponíveis
                </CardTitle>
                <CardDescription>Grade de tamanhos do produto</CardDescription>
              </div>
              <Badge tone="gold">{selectedSizes.length} selecionado(s)</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {sizeList.map((s) => {
                  const active = selectedSizes.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSize(s.id)}
                      className={cn(
                        "min-w-10 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1">
                  <input
                    value={newSizeName}
                    onChange={(e) => setNewSizeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddSize();
                      }
                    }}
                    placeholder="Novo tam..."
                    className="field h-8 w-24 py-0 text-[11px]"
                  />
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => void handleAddSize()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Grade de estoque</CardTitle>
                <CardDescription>
                  {enabledCells.length} combinação(ões) · {num(totalStock)} peças ·{" "}
                  custo {brl(totalCostValue)} · venda {brl(totalSaleValue)}
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={applyAllFromBase} leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
                Aplicar preço base na grade
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {enabledCells.length === 0 ? (
                <Alert tone="info">
                  Selecione ao menos uma cor ou tamanho acima para montar a grade. Se o produto não
                  tiver variações, deixe ambos vazios e uma variação única será criada.
                </Alert>
              ) : (
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-left">
                      <th className="w-8 px-1 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ativo</th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Variação</th>
                      <th className="w-24 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Estoque</th>
                      <th className="w-28 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Custo</th>
                      <th className="w-28 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Venda</th>
                      <th className="w-36 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Cód. barras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridKeys.map((g) => {
                      const cell = cells[g.key];
                      if (!cell) return null;
                      return (
                        <tr key={g.key} className="border-b border-[var(--border-default)] last:border-0">
                          <td className="px-1 py-1.5">
                            <input
                              type="checkbox"
                              checked={cell.enabled}
                              onChange={(e) => updateCell(g.key, { enabled: e.target.checked })}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              {g.colorName && (
                                <span
                                  className="h-3 w-3 rounded-full border border-black/10"
                                  style={{
                                    background: colorList.find((c) => c.id === g.colorId)?.hex ?? "#ccc",
                                  }}
                                />
                              )}
                              <span className="text-xs font-medium">
                                {[g.colorName, g.sizeName].filter(Boolean).join(" / ") || "Variação única"}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              value={cell.stock}
                              onChange={(e) => updateCell(g.key, { stock: Number(e.target.value) })}
                              disabled={!cell.enabled || (!permissions.canAdjustStock && mode === "edit")}
                              className="field h-8 py-0 text-right text-xs tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={cell.cost}
                              onChange={(e) => updateCell(g.key, { cost: Number(e.target.value) })}
                              disabled={!permissions.canChangePrice}
                              className="field h-8 py-0 text-right text-xs tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={cell.price}
                              onChange={(e) => updateCell(g.key, { price: Number(e.target.value) })}
                              disabled={!permissions.canChangePrice}
                              className="field h-8 py-0 text-right text-xs font-semibold tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={cell.barcode}
                              onChange={(e) => updateCell(g.key, { barcode: e.target.value })}
                              placeholder="opcional"
                              disabled={!cell.enabled}
                              className="field h-8 py-0 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "fiscal" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Dados fiscais</CardTitle>
                <CardDescription>
                  Informações usadas na emissão de NFC-e/NF-e quando houver provedor fiscal conectado
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="NCM" hint="Nomenclatura Comum do Mercosul (8 dígitos)">
                <Input
                  value={form.ncm}
                  onChange={(e) => setForm({ ...form, ncm: onlyDigits(e.target.value).slice(0, 8) })}
                  placeholder="62046200"
                />
              </Field>
              <Field label="CEST" hint="Apenas se aplicável">
                <Input
                  value={form.cest}
                  onChange={(e) => setForm({ ...form, cest: onlyDigits(e.target.value).slice(0, 7) })}
                  placeholder="2806300"
                />
              </Field>
              <Field label="CFOP" hint="Padrão: 5102 (venda dentro do estado)">
                <Input
                  value={form.cfop}
                  onChange={(e) => setForm({ ...form, cfop: onlyDigits(e.target.value).slice(0, 4) })}
                  placeholder="5102"
                />
              </Field>
              <Field label="CSOSN / CST">
                <Select value={form.csosn} onChange={(e) => setForm({ ...form, csosn: e.target.value })}>
                  <option value="102">102 - Simples Nacional sem crédito</option>
                  <option value="101">101 - Simples com crédito</option>
                  <option value="103">103 - Simples, isenção do ICMS</option>
                  <option value="500">500 - ICMS cobrado anteriormente</option>
                  <option value="00">00 - Tributada integralmente</option>
                  <option value="40">40 - Isenta</option>
                  <option value="41">41 - Não tributada</option>
                  <option value="60">60 - ICMS cobrado por substituição</option>
                </Select>
              </Field>
              <Field label="Origem da mercadoria">
                <Select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
                  <option value="0">0 - Nacional</option>
                  <option value="1">1 - Estrangeira (importação direta)</option>
                  <option value="2">2 - Estrangeira (mercado interno)</option>
                  <option value="3">3 - Nacional, importação entre 40% e 70%</option>
                  <option value="4">4 - Nacional, processos produtivos básicos</option>
                  <option value="5">5 - Nacional, importação até 40%</option>
                  <option value="8">8 - Nacional, importação acima de 70%</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Alert tone="info" title="Emissão fiscal">
                  A emissão de documentos fiscais depende de provedor autorizado configurado em{" "}
                  <strong>Configurações → Fiscal</strong>. Sem provedor, o sistema registra os
                  documentos apenas em ambiente de homologação simulado, sempre identificado.
                </Alert>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Observações internas</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={8}
                placeholder="Anotações sobre o produto (não aparecem para o cliente)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="sticky bottom-3 flex justify-end gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]/95 p-2.5 backdrop-blur">
        <Link href={mode === "edit" && initial?.id ? `/produtos/${initial.id}` : "/produtos"}>
          <Button type="button" variant="outline" size="sm">Cancelar</Button>
        </Link>
        <Button type="submit" size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />}>
          {mode === "create" ? "Cadastrar produto" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

void Loader2;
