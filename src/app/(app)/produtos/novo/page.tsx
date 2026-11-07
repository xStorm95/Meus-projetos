import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { brands, categories, collections, colors, sizes, suppliers } from "@/server/db/schema";
import { ProductForm } from "@/components/products/product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("products.create")) redirect("/produtos");

  const [categoryRows, brandRows, colorRows, sizeRows, collectionRows, supplierRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select({ id: colors.id, name: colors.name, hex: colors.hex }).from(colors).orderBy(asc(colors.sortOrder)),
    db.select({ id: sizes.id, name: sizes.name }).from(sizes).orderBy(asc(sizes.sortOrder)),
    db.select({ id: collections.id, name: collections.name }).from(collections).orderBy(asc(collections.name)),
    db.select({ id: suppliers.id, legalName: suppliers.legalName }).from(suppliers).orderBy(asc(suppliers.legalName)).limit(500),
  ]);

  return (
    <ProductForm
      mode="create"
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
