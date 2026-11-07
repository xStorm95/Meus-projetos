import { notFound, redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { getProduct } from "@/server/services/products";
import { db } from "@/server/db/client";
import { brands, categories, collections, colors, sizes, suppliers } from "@/server/db/schema";
import { ProductForm } from "@/components/products/product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("products.update")) redirect("/produtos");

  const { id } = await params;
  const [data, categoryRows, brandRows, colorRows, sizeRows, collectionRows, supplierRows] = await Promise.all([
    getProduct(id).catch(() => null),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select({ id: colors.id, name: colors.name, hex: colors.hex }).from(colors).orderBy(asc(colors.sortOrder)),
    db.select({ id: sizes.id, name: sizes.name }).from(sizes).orderBy(asc(sizes.sortOrder)),
    db.select({ id: collections.id, name: collections.name }).from(collections).orderBy(asc(collections.name)),
    db.select({ id: suppliers.id, legalName: suppliers.legalName }).from(suppliers).limit(500),
  ]);
  if (!data) notFound();

  return (
    <ProductForm
      mode="edit"
      initial={{
        id: data.product.id,
        name: data.product.name,
        reference: data.product.reference,
        barcode: data.product.barcode,
        description: data.product.description,
        categoryId: data.product.categoryId,
        brandId: data.product.brandId,
        supplierId: data.product.supplierId,
        collectionId: data.product.collectionId,
        material: data.product.material,
        composition: data.product.composition,
        costPrice: data.product.costPrice,
        salePrice: data.product.salePrice,
        promoPrice: data.product.promoPrice,
        promoStartsAt: data.product.promoStartsAt,
        promoEndsAt: data.product.promoEndsAt,
        maxDiscountPercent: data.product.maxDiscountPercent,
        lowStock: data.product.lowStock,
        images: data.product.images,
        status: data.product.status,
        showOnline: data.product.showOnline,
        notes: data.product.notes,
        ncm: data.product.ncm,
        cest: data.product.cest,
        cfop: data.product.cfop,
        csosn: data.product.csosn,
        origin: data.product.origin,
        unit: data.product.unit,
        variants: data.variants.map((v) => ({
          id: v.id,
          colorId: v.colorId,
          sizeId: v.sizeId,
          colorName: v.colorName,
          sizeName: v.sizeName,
          sku: v.sku,
          barcode: v.barcode,
          costPrice: v.costPrice,
          salePrice: v.salePrice,
          stockQty: v.stockQty,
        })),
      }}
      categories={categoryRows}
      brands={brandRows}
      colors={colorRows}
      sizes={sizeRows}
      collections={collectionRows}
      suppliers={supplierRows}
      permissions={{
        canChangePrice: user.permissions.includes("products.price.update"),
        canAdjustStock: user.permissions.includes("stock.adjust"),
      }}
    />
  );
}
