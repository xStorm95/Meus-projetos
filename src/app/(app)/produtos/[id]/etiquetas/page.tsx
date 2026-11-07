import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { productVariants, products } from "@/server/db/schema";
import { getSettingsCached } from "@/server/services/settings";
import { brl } from "@/lib/utils";
import { LabelsView } from "@/components/products/labels-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiquetas" };

export default async function LabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("products.view")) redirect("/produtos");

  const { id } = await params;
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!rows[0]) notFound();

  const [variants, settings] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.colorName), asc(productVariants.sizeName)),
    getSettingsCached(),
  ]);

  return (
    <LabelsView
      product={{ id: rows[0].id, name: rows[0].name, reference: rows[0].reference }}
      companyName={settings.companyName}
      labels={variants
        .filter((v) => v.isActive)
        .map((v) => ({
          variantId: v.id,
          sku: v.sku,
          barcode: v.barcode || v.sku,
          productName: rows[0].name,
          reference: rows[0].reference,
          colorName: v.colorName,
          sizeName: v.sizeName,
          price: brl(v.promoPrice && Number(v.promoPrice) > 0 ? v.promoPrice : v.salePrice),
          priceRaw: String(v.promoPrice && Number(v.promoPrice) > 0 ? v.promoPrice : v.salePrice),
        }))}
    />
  );
}
