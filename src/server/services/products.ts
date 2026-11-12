/**
 * Serviço de produtos e variações (grade cor × tamanho).
 *
 * Regras:
 *  - Toda variação tem SKU único gerado a partir da referência + cor + tamanho.
 *  - Alterações de preço/custo geram registro em price_histories (auditoria).
 *  - Produto com movimentação de estoque/venda não é excluído fisicamente:
 *    é inativado (soft delete), preservando histórico fiscal e contábil.
 *  - Estoque inicial declarado no cadastro gera movimentação do tipo OPENING.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  brands,
  categories,
  collections,
  colors,
  priceHistories,
  productKitItems,
  productVariants,
  products,
  saleItems,
  sizes,
  stockMovements,
} from "../db/schema";
import { BusinessRuleError, ConflictError, NotFoundError } from "../lib/errors";
import { d, money } from "../lib/money";
import { getDefaultWarehouse, moveStock, type Tx } from "./stock";
import { writeAudit } from "../lib/audit";
import { slugify } from "@/lib/utils";

export type VariantInput = {
  id?: string;
  colorId?: string | null;
  sizeId?: string | null;
  barcode?: string | null;
  costPrice?: string | number;
  salePrice?: string | number;
  promoPrice?: string | number | null;
  stockQty?: string | number;
  lowStock?: number | null;
  isActive?: boolean;
};

export type ProductInput = {
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
  origin?: string;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  cstIcms?: string | null;
  csosn?: string | null;
  unit?: string;
  costPrice: string | number;
  salePrice: string | number;
  promoPrice?: string | number | null;
  promoStartsAt?: string | null;
  promoEndsAt?: string | null;
  maxDiscountPercent?: string | number | null;
  lowStock?: number;
  images?: string[];
  status?: "ACTIVE" | "INACTIVE";
  showOnline?: boolean;
  notes?: string | null;
  /** Grade de variações */
  variants?: VariantInput[];
  /** Combinações cor × tamanho para gerar a grade automaticamente */
  grid?: { colorIds: string[]; sizeIds: string[] };
  kitItems?: Array<{ variantId: string; quantity: number }>;
};

/**
 * Gera um SKU único no padrão REF-COR-TAM.
 * IMPORTANTE: dentro de transações, passe o `tx` — nunca use a conexão global
 * (`db`) dentro de uma transação (risco de deadlock/bloqueio de conexão).
 */
export async function generateSku(
  executor: Tx | typeof db,
  base: string,
  colorName?: string | null,
  sizeName?: string | null,
  suffix = 0,
): Promise<string> {
  const clean = (v: string) => slugify(v).toUpperCase().replace(/-/g, "").slice(0, 6) || "X";
  const parts = [base.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12)];
  if (colorName) parts.push(clean(colorName));
  if (sizeName) parts.push(sizeName.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
  const sku = `${parts.join("-")}${suffix ? `-${suffix}` : ""}`;
  const existing = await executor
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, sku))
    .limit(1);
  if (existing[0]) return generateSku(executor, base, colorName, sizeName, suffix + 1);
  return sku;
}

function normalizeReference(name: string, provided?: string): string {
  if (provided?.trim()) return provided.trim().toUpperCase().replace(/\s+/g, "-");
  const base = slugify(name).toUpperCase().replace(/-/g, "").slice(0, 8);
  return `${base}${String(Date.now()).slice(-4)}`;
}

/** Sobrescreve a parte aleatória da referência automática, sem tocar na base do nome. */
function referenceComSufixo(reference: string, suffix: string): string {
  return `${reference.slice(0, -4)}${suffix}`;
}

export async function createProduct(input: ProductInput, actor: { id: string; name: string }) {
  if (!input.name?.trim()) throw new BusinessRuleError("Informe o nome do produto.");
  if (d(input.salePrice).lt(0) || d(input.costPrice).lt(0)) {
    throw new BusinessRuleError("Custo e preço de venda não podem ser negativos.");
  }

  // A referência automática usa os últimos 4 dígitos do relógio, então duas criações na mesma
  // janela de 10 s colidem. Quando ela é automática, tenta alguns sufixos antes de desistir;
  // referência informada pelo usuário continua sendo erro imediato (é escolha dele).
  const automaticReference = !input.reference?.trim();
  let reference = normalizeReference(input.name, input.reference);
  for (let attempt = 0; ; attempt++) {
    const duplicated = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.reference, reference))
      .limit(1);
    if (!duplicated[0]) break;
    if (!automaticReference || attempt >= 20) {
      throw new ConflictError(`Já existe um produto com a referência "${reference}".`);
    }
    const seed = `${Date.now()}${attempt}${Math.floor(Math.random() * 1000)}`;
    reference = referenceComSufixo(reference, seed.slice(-4).padStart(4, "0"));
  }
  if (input.barcode) {
    const dupBar = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.barcode, input.barcode))
      .limit(1);
    if (dupBar[0]) throw new ConflictError("Este código de barras já está em uso por outro produto.");
  }

  // Monta lista de variações: explícitas ou grade gerada
  let variantDefs: VariantInput[] = input.variants ?? [];
  if ((!variantDefs.length) && input.grid) {
    const colorList = input.grid.colorIds.length
      ? input.grid.colorIds
      : [];
    const sizeList = input.grid.sizeIds.length ? input.grid.sizeIds : [];
    if (!colorList.length && !sizeList.length) {
      variantDefs = [{}];
    } else if (!sizeList.length) {
      variantDefs = colorList.map((colorId) => ({ colorId }));
    } else if (!colorList.length) {
      variantDefs = sizeList.map((sizeId) => ({ sizeId }));
    } else {
      variantDefs = colorList.flatMap((colorId) => sizeList.map((sizeId) => ({ colorId, sizeId })));
    }
  }
  if (!variantDefs.length) variantDefs = [{}];

  // Carrega nomes de cor/tamanho
  const colorIds = [...new Set(variantDefs.map((v) => v.colorId).filter(Boolean))] as string[];
  const sizeIds = [...new Set(variantDefs.map((v) => v.sizeId).filter(Boolean))] as string[];
  const [colorRows, sizeRows] = await Promise.all([
    colorIds.length
      ? db.select().from(colors).where(inArray(colors.id, colorIds))
      : Promise.resolve([] as Array<typeof colors.$inferSelect>),
    sizeIds.length
      ? db.select().from(sizes).where(inArray(sizes.id, sizeIds))
      : Promise.resolve([] as Array<typeof sizes.$inferSelect>),
  ]);
  const colorMap = new Map(colorRows.map((c) => [c.id, c]));
  const sizeMap = new Map(sizeRows.map((s) => [s.id, s]));

  return db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        name: input.name.trim(),
        reference,
        barcode: input.barcode || null,
        description: input.description ?? null,
        categoryId: input.categoryId || null,
        subcategoryId: input.subcategoryId || null,
        brandId: input.brandId || null,
        supplierId: input.supplierId || null,
        collectionId: input.collectionId || null,
        material: input.material ?? null,
        composition: input.composition ?? null,
        origin: input.origin ?? "0",
        ncm: input.ncm ?? null,
        cest: input.cest ?? null,
        cfop: input.cfop ?? null,
        cstIcms: input.cstIcms ?? null,
        csosn: input.csosn ?? null,
        unit: input.unit ?? "UN",
        costPrice: money(input.costPrice),
        salePrice: money(input.salePrice),
        promoPrice: input.promoPrice ? money(input.promoPrice) : null,
        promoStartsAt: input.promoStartsAt ?? null,
        promoEndsAt: input.promoEndsAt ?? null,
        maxDiscountPercent: input.maxDiscountPercent ? money(input.maxDiscountPercent) : null,
        lowStock: input.lowStock ?? 5,
        hasVariants: variantDefs.length > 1 || Boolean(variantDefs[0]?.colorId || variantDefs[0]?.sizeId),
        isKit: Boolean(input.kitItems?.length),
        images: input.images ?? [],
        status: input.status ?? "ACTIVE",
        showOnline: input.showOnline ?? false,
        notes: input.notes ?? null,
        createdBy: actor.id,
      })
      .returning();

    const warehouse = await getDefaultWarehouse(tx);
    const createdVariants: Array<typeof productVariants.$inferInsert> = [];

    for (const def of variantDefs) {
      const color = def.colorId ? colorMap.get(def.colorId) : undefined;
      const size = def.sizeId ? sizeMap.get(def.sizeId) : undefined;
      const sku = await generateSku(tx, reference, color?.name, size?.name);
      const variantCost = money(def.costPrice ?? product.costPrice);
      const variantPrice = money(def.salePrice ?? product.salePrice);
      const initialQty = Number(def.stockQty ?? 0);

      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: product.id,
          sku,
          barcode: def.barcode || null,
          colorId: color?.id ?? null,
          sizeId: size?.id ?? null,
          colorName: color?.name ?? null,
          sizeName: size?.name ?? null,
          costPrice: variantCost,
          salePrice: variantPrice,
          promoPrice: def.promoPrice ? money(def.promoPrice) : null,
          lowStock: def.lowStock ?? null,
          isActive: def.isActive ?? true,
        })
        .returning();
      createdVariants.push(variant);

      if (initialQty > 0) {
        await moveStock(tx, {
          variantId: variant.id,
          warehouseId: warehouse.id,
          delta: initialQty,
          type: "OPENING",
          referenceType: "PRODUCT",
          referenceId: product.id,
          reason: "Estoque inicial do cadastro",
          userId: actor.id,
          userName: actor.name,
        });
      }
    }

    // Kit
    if (input.kitItems?.length) {
      for (const item of input.kitItems) {
        await tx.insert(productKitItems).values({
          kitProductId: product.id,
          componentVariantId: item.variantId,
          quantity: money(item.quantity),
        });
      }
    }

    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      action: "PRODUCT_CREATE",
      entity: "product",
      entityId: product.id,
      description: `Produto "${product.name}" (${reference}) criado com ${createdVariants.length} variação(ões)`,
      after: { name: product.name, reference, salePrice: product.salePrice },
    }, tx);

    return { product, variants: createdVariants };
  });
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput> & { variants?: VariantInput[] },
  actor: { id: string; name: string },
) {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const product = rows[0];
  if (!product) throw new NotFoundError("Produto");

  return db.transaction(async (tx) => {
    const patch: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
    const fields: Array<keyof ProductInput> = [
      "name", "description", "categoryId", "subcategoryId", "brandId", "supplierId",
      "collectionId", "material", "composition", "origin", "ncm", "cest", "cfop",
      "cstIcms", "csosn", "unit", "promoStartsAt", "promoEndsAt", "status", "notes",
    ];
    for (const field of fields) {
      if (input[field] !== undefined) {
        (patch as Record<string, unknown>)[field] = input[field] || null;
      }
    }
    if (input.name !== undefined) patch.name = input.name;
    if (input.lowStock !== undefined) patch.lowStock = input.lowStock;
    if (input.showOnline !== undefined) patch.showOnline = input.showOnline;
    if (input.images !== undefined) patch.images = input.images;
    if (input.barcode !== undefined) patch.barcode = input.barcode || null;

    // Registro de histórico de preços
    const priceFields: Array<{ field: "costPrice" | "salePrice" | "promoPrice"; value: unknown }> = [
      { field: "costPrice", value: input.costPrice },
      { field: "salePrice", value: input.salePrice },
      { field: "promoPrice", value: input.promoPrice },
    ];
    for (const { field, value } of priceFields) {
      if (value === undefined) continue;
      const newValue = value === null ? "0.00" : money(value as string | number);
      const oldValue = (product[field] as string | null) ?? "0.00";
      if (!d(oldValue).eq(d(newValue))) {
        await tx.insert(priceHistories).values({
          productId: id,
          field,
          oldValue: money(oldValue),
          newValue,
          reason: "Alteração no cadastro do produto",
          userId: actor.id,
        });
        (patch as Record<string, unknown>)[field] = field === "promoPrice" && !value ? null : newValue;
      }
    }
    if (input.maxDiscountPercent !== undefined) {
      patch.maxDiscountPercent = input.maxDiscountPercent ? money(input.maxDiscountPercent) : null;
    }

    const [updated] = await tx.update(products).set(patch).where(eq(products.id, id)).returning();

    // Atualização de variações existentes
    for (const variantInput of input.variants ?? []) {
      if (!variantInput.id) continue;
      const vRows = await tx.select().from(productVariants).where(eq(productVariants.id, variantInput.id)).limit(1);
      const variant = vRows[0];
      if (!variant || variant.productId !== id) continue;

      const vPatch: Partial<typeof productVariants.$inferInsert> = { updatedAt: new Date() };
      if (variantInput.barcode !== undefined) vPatch.barcode = variantInput.barcode || null;
      if (variantInput.isActive !== undefined) vPatch.isActive = variantInput.isActive;
      if (variantInput.lowStock !== undefined) vPatch.lowStock = variantInput.lowStock;
      for (const field of ["costPrice", "salePrice", "promoPrice"] as const) {
        const value = variantInput[field];
        if (value === undefined) continue;
        const newValue = value === null ? null : money(value);
        const oldValue = variant[field];
        if ((newValue ?? null) !== (oldValue ?? null) && newValue !== null) {
          await tx.insert(priceHistories).values({
            productId: id,
            variantId: variant.id,
            field,
            oldValue: oldValue ? money(oldValue) : null,
            newValue,
            reason: "Alteração de preço da variação",
            userId: actor.id,
          });
        }
        (vPatch as Record<string, unknown>)[field] = newValue;
      }
      await tx.update(productVariants).set(vPatch).where(eq(productVariants.id, variant.id));

      // Ajuste de estoque informado diretamente na edição
      if (variantInput.stockQty !== undefined) {
        const target = Number(variantInput.stockQty);
        const current = Number(variant.stockQty);
        if (target !== current) {
          const warehouse = await getDefaultWarehouse(tx);
          await moveStock(tx, {
            variantId: variant.id,
            warehouseId: warehouse.id,
            delta: target - current,
            type: "ADJUSTMENT",
            referenceType: "MANUAL",
            referenceId: id,
            reason: "Ajuste realizado na edição do produto",
            userId: actor.id,
            userName: actor.name,
            allowNegative: target >= 0,
          });
        }
      }
    }

    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      action: "PRODUCT_UPDATE",
      entity: "product",
      entityId: id,
      description: `Produto "${updated.name}" atualizado`,
      before: { name: product.name, salePrice: product.salePrice, costPrice: product.costPrice },
      after: { name: updated.name, salePrice: updated.salePrice, costPrice: updated.costPrice },
    }, tx);

    return updated;
  });
}

/** Adiciona novas variações a um produto existente (ampliar grade). */
export async function addVariants(
  productId: string,
  defs: VariantInput[],
  actor: { id: string; name: string },
) {
  const rows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  const product = rows[0];
  if (!product) throw new NotFoundError("Produto");

  const colorIds = [...new Set(defs.map((v) => v.colorId).filter(Boolean))] as string[];
  const sizeIds = [...new Set(defs.map((v) => v.sizeId).filter(Boolean))] as string[];
  const [colorRows, sizeRows] = await Promise.all([
    colorIds.length ? db.select().from(colors).where(inArray(colors.id, colorIds)) : Promise.resolve([]),
    sizeIds.length ? db.select().from(sizes).where(inArray(sizes.id, sizeIds)) : Promise.resolve([]),
  ]);
  const colorMap = new Map(colorRows.map((c) => [c.id, c]));
  const sizeMap = new Map(sizeRows.map((s) => [s.id, s]));

  return db.transaction(async (tx) => {
    const warehouse = await getDefaultWarehouse(tx);
    const created: Array<typeof productVariants.$inferSelect> = [];
    for (const def of defs) {
      const color = def.colorId ? colorMap.get(def.colorId) : undefined;
      const size = def.sizeId ? sizeMap.get(def.sizeId) : undefined;
      const existing = await tx
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, productId),
            def.colorId ? eq(productVariants.colorId, def.colorId) : isNull(productVariants.colorId),
            def.sizeId ? eq(productVariants.sizeId, def.sizeId) : isNull(productVariants.sizeId),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const sku = await generateSku(tx, product.reference, color?.name, size?.name);
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId,
          sku,
          barcode: def.barcode || null,
          colorId: color?.id ?? null,
          sizeId: size?.id ?? null,
          colorName: color?.name ?? null,
          sizeName: size?.name ?? null,
          costPrice: money(def.costPrice ?? product.costPrice),
          salePrice: money(def.salePrice ?? product.salePrice),
          lowStock: def.lowStock ?? null,
        })
        .returning();

      const initial = Number(def.stockQty ?? 0);
      if (initial > 0) {
        await moveStock(tx, {
          variantId: variant.id,
          warehouseId: warehouse.id,
          delta: initial,
          type: "OPENING",
          referenceType: "PRODUCT",
          referenceId: productId,
          reason: "Estoque inicial da nova variação",
          userId: actor.id,
          userName: actor.name,
        });
      }
      created.push(variant);
    }
    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      action: "PRODUCT_VARIANTS_ADD",
      entity: "product",
      entityId: productId,
      description: `${created.length} variação(ões) adicionada(s) ao produto ${product.reference}`,
    }, tx);
    return created;
  });
}

export async function getProduct(id: string) {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Produto");
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.colorName), asc(productVariants.sizeName));
  const history = await db
    .select()
    .from(priceHistories)
    .where(eq(priceHistories.productId, id))
    .orderBy(desc(priceHistories.createdAt))
    .limit(40);
  const kitItems = await db
    .select({
      id: productKitItems.id,
      quantity: productKitItems.quantity,
      variantId: productKitItems.componentVariantId,
      sku: productVariants.sku,
      colorName: productVariants.colorName,
      sizeName: productVariants.sizeName,
    })
    .from(productKitItems)
    .innerJoin(productVariants, eq(productVariants.id, productKitItems.componentVariantId))
    .where(eq(productKitItems.kitProductId, id));

  const [category, brand, collection] = await Promise.all([
    rows[0].categoryId
      ? db.select().from(categories).where(eq(categories.id, rows[0].categoryId)).limit(1)
      : Promise.resolve([]),
    rows[0].brandId
      ? db.select().from(brands).where(eq(brands.id, rows[0].brandId)).limit(1)
      : Promise.resolve([]),
    rows[0].collectionId
      ? db.select().from(collections).where(eq(collections.id, rows[0].collectionId)).limit(1)
      : Promise.resolve([]),
  ]);

  const totalStock = variants.reduce((acc, v) => acc + Number(v.stockQty), 0);
  const totalCost = variants.reduce((acc, v) => acc + Number(v.costPrice) * Number(v.stockQty), 0);
  const totalSaleValue = variants.reduce((acc, v) => acc + Number(v.salePrice) * Number(v.stockQty), 0);

  return {
    product: rows[0],
    category: category[0] ?? null,
    brand: brand[0] ?? null,
    collection: collection[0] ?? null,
    variants,
    priceHistory: history,
    kitItems,
    totals: {
      stock: totalStock,
      costValue: money(totalCost),
      saleValue: money(totalSaleValue),
      margin: totalSaleValue > 0 ? ((totalSaleValue - totalCost) / totalSaleValue) * 100 : 0,
    },
  };
}

export async function listProducts(params: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  stockFilter?: "all" | "low" | "out" | "available";
  page?: number;
  pageSize?: number;
  sort?: "name" | "stock" | "price" | "recent";
}) {
  const conds: SQL[] = [isNull(products.deletedAt)];
  if (params.search) {
    const term = `%${params.search}%`;
    conds.push(
      sql`(${products.name} ILIKE ${term} OR ${products.reference} ILIKE ${term} OR ${products.barcode} ILIKE ${term} OR EXISTS (SELECT 1 FROM product_variants pv3 WHERE pv3.product_id = ${products.id} AND (pv3.sku ILIKE ${term} OR pv3.barcode ILIKE ${term})))`,
    );
  }
  if (params.categoryId) conds.push(eq(products.categoryId, params.categoryId));
  if (params.brandId) conds.push(eq(products.brandId, params.brandId));
  if (params.status && params.status !== "ALL") {
    conds.push(eq(products.status, params.status as "ACTIVE" | "INACTIVE"));
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);

  const stockExpr = sql<string>`COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.is_active = true), 0)::text`;
  const variantCount = sql<number>`COALESCE((SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.is_active = true), 0)::int`;

  if (params.stockFilter === "low") {
    conds.push(sql`COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv WHERE pv.product_id = ${products.id}), 0)::numeric <= ${products.lowStock}::numeric`);
  } else if (params.stockFilter === "out") {
    conds.push(sql`COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv WHERE pv.product_id = ${products.id}), 0)::numeric <= 0`);
  } else if (params.stockFilter === "available") {
    conds.push(sql`COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv WHERE pv.product_id = ${products.id}), 0)::numeric > 0`);
  }

  const where = and(...conds);
  const orderBy =
    params.sort === "stock"
      ? desc(stockExpr)
      : params.sort === "price"
        ? desc(products.salePrice)
        : params.sort === "name"
          ? asc(products.name)
          : desc(products.createdAt);

  const [items, countRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        reference: products.reference,
        barcode: products.barcode,
        salePrice: products.salePrice,
        costPrice: products.costPrice,
        promoPrice: products.promoPrice,
        status: products.status,
        lowStock: products.lowStock,
        images: products.images,
        hasVariants: products.hasVariants,
        isKit: products.isKit,
        categoryName: categories.name,
        brandName: brands.name,
        stock: stockExpr,
        variantCount,
        createdAt: products.createdAt,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(products).where(where),
  ]);

  return {
    items: items.map((p) => ({
      ...p,
      salePrice: money(p.salePrice),
      costPrice: money(p.costPrice),
      promoPrice: p.promoPrice ? money(p.promoPrice) : null,
      stock: Number(p.stock),
      createdAt: p.createdAt.toISOString(),
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

/**
 * Busca para o PDV — retorna VARIAÇÕES (não produtos), pois é a variação
 * que é vendida. Aceita nome, referência, SKU, código de barras ou categoria.
 */
export async function searchVariants(params: { q: string; limit?: number }) {
  const term = `%${params.q.trim()}%`;
  const exact = params.q.trim();
  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      name: products.name,
      reference: products.reference,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      colorName: productVariants.colorName,
      sizeName: productVariants.sizeName,
      salePrice: productVariants.salePrice,
      promoPrice: productVariants.promoPrice,
      costPrice: productVariants.costPrice,
      stockQty: productVariants.stockQty,
      reservedQty: productVariants.reservedQty,
      categoryName: categories.name,
      image: sql<string | null>`(${products.images}->>0)`,
      promoStartsAt: products.promoStartsAt,
      promoEndsAt: products.promoEndsAt,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(products.status, "ACTIVE"),
        isNull(products.deletedAt),
        eq(productVariants.isActive, true),
        or(
          ilike(products.name, term),
          ilike(products.reference, term),
          ilike(productVariants.sku, term),
          ilike(productVariants.barcode, term),
          eq(productVariants.barcode, exact),
          eq(productVariants.sku, exact.toUpperCase()),
          ilike(categories.name, term),
        ),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${productVariants.barcode} = ${exact} OR ${productVariants.sku} = ${exact.toUpperCase()} THEN 0 ELSE 1 END`,
      asc(products.name),
      asc(productVariants.sizeName),
    )
    .limit(params.limit ?? 25);

  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const promoActive =
      r.promoPrice &&
      Number(r.promoPrice) > 0 &&
      (!r.promoStartsAt || r.promoStartsAt <= today) &&
      (!r.promoEndsAt || r.promoEndsAt >= today);
    return {
      ...r,
      effectivePrice: money(promoActive ? r.promoPrice! : r.salePrice),
      listPrice: money(r.salePrice),
      costPrice: money(r.costPrice),
      stockQty: Number(r.stockQty),
      reservedQty: Number(r.reservedQty),
      available: Number(r.stockQty) - Number(r.reservedQty),
      isPromo: Boolean(promoActive),
    };
  });
}

/** Exclusão segura: inativa se houver histórico, senão remove. */
export async function deleteProduct(id: string, actor: { id: string; name: string }) {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const product = rows[0];
  if (!product) throw new NotFoundError("Produto");

  const [soldRows, movedRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(saleItems).where(eq(saleItems.productId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.productId, id)),
  ]);
  const hasHistory = Number(soldRows[0]?.count ?? 0) > 0 || Number(movedRows[0]?.count ?? 0) > 0;

  if (hasHistory) {
    await db
      .update(products)
      .set({ status: "INACTIVE", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(products.id, id));
    await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.productId, id));
    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      action: "PRODUCT_DEACTIVATE",
      entity: "product",
      entityId: id,
      description: `Produto "${product.name}" inativado (possui histórico de vendas/movimentações)`,
    });
    return { action: "deactivated" as const };
  }

  await db.delete(products).where(eq(products.id, id));
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "PRODUCT_DELETE",
    entity: "product",
    entityId: id,
    description: `Produto "${product.name}" (${product.reference}) excluído`,
    before: { name: product.name, reference: product.reference },
  });
  return { action: "deleted" as const };
}

export async function duplicateProduct(id: string, actor: { id: string; name: string }) {
  const data = await getProduct(id);
  const newReference = `${data.product.reference}-COPIA`;
  const exists = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.reference, newReference))
    .limit(1);
  const reference = exists[0] ? `${newReference}-${String(Date.now()).slice(-4)}` : newReference;

  return createProduct(
    {
      name: `${data.product.name} (cópia)`,
      reference,
      description: data.product.description,
      categoryId: data.product.categoryId,
      subcategoryId: data.product.subcategoryId,
      brandId: data.product.brandId,
      supplierId: data.product.supplierId,
      collectionId: data.product.collectionId,
      material: data.product.material,
      composition: data.product.composition,
      origin: data.product.origin,
      ncm: data.product.ncm,
      csosn: data.product.csosn,
      costPrice: data.product.costPrice,
      salePrice: data.product.salePrice,
      promoPrice: data.product.promoPrice,
      lowStock: data.product.lowStock,
      images: data.product.images,
      variants: data.variants.map((v) => ({
        colorId: v.colorId,
        sizeId: v.sizeId,
        costPrice: v.costPrice,
        salePrice: v.salePrice,
        stockQty: 0,
      })),
    },
    actor,
  );
}

/** Histórico de movimentação de uma variação. */
export async function variantHistory(variantId: string, limit = 100) {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.variantId, variantId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

export function normalizeText(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
