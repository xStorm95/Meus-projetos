import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { NotFoundError } from "@/server/lib/errors";
import { db } from "@/server/db/client";
import { products, productVariants } from "@/server/db/schema";
import { brl } from "@/lib/utils";

/**
 * Dados para impressão de etiquetas com código de barras (EAN-13 quando
 * disponível, senão Code128 com o SKU). O PDF/impressão é gerado no navegador
 * pelo módulo de etiquetas — o servidor fornece dados e valida permissões.
 */
export const GET = apiHandler<unknown, z.infer<typeof querySchema>, { id: string }>(
  { permission: "products.view", query: z.object({ copies: z.coerce.number().int().min(1).max(200).optional() }) },
  async ({ params, query }) => {
    const rows = await db.select().from(products).where(eq(products.id, params.id)).limit(1);
    if (!rows[0]) throw new NotFoundError("Produto");
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, params.id))
      .orderBy(asc(productVariants.colorName), asc(productVariants.sizeName));

    const copies = query.copies ?? 1;
    const labels = variants
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
        priceRaw: v.promoPrice && Number(v.promoPrice) > 0 ? v.promoPrice : v.salePrice,
        copies,
      }));

    return ok({
      product: {
        id: rows[0].id,
        name: rows[0].name,
        reference: rows[0].reference,
        brand: null as string | null,
      },
      labels,
      totalLabels: labels.reduce((acc, l) => acc + l.copies, 0),
    });
  },
);

const querySchema = z.object({ copies: z.coerce.number().int().min(1).max(200).optional() });
