import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { customers, productVariants, products, sales, suppliers } from "@/server/db/schema";
import { money } from "@/server/lib/money";

const querySchema = z.object({ q: z.string().trim().min(2, "Digite ao menos 2 caracteres.") });

export const GET = apiHandler({ query: querySchema }, async ({ query }) => {
  const term = `%${query.q}%`;
  const digits = query.q.replace(/\D/g, "");

  const [productRows, customerRows, saleRows, supplierRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        reference: products.reference,
        price: products.salePrice,
        stock: sql<string>`COALESCE(SUM(${productVariants.stockQty}), 0)::text`,
      })
      .from(products)
      .leftJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          isNull(products.deletedAt),
          or(
            ilike(products.name, term),
            ilike(products.reference, term),
            ilike(products.barcode, term),
            digits.length >= 3
              ? sql`EXISTS (SELECT 1 FROM product_variants pv2 WHERE pv2.product_id = ${products.id} AND (pv2.sku ILIKE ${term} OR pv2.barcode ILIKE ${term}))`
              : undefined,
          ),
        ),
      )
      .groupBy(products.id)
      .limit(6),
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        document: customers.document,
      })
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          or(
            ilike(customers.name, term),
            ilike(customers.phone, term),
            digits.length >= 4 ? ilike(customers.document, `%${digits}%`) : undefined,
            ilike(customers.email, term),
          ),
        ),
      )
      .limit(5),
    db
      .select({
        id: sales.id,
        number: sales.number,
        total: sales.total,
        customerName: customers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(
        digits.length > 0 && /^\d+$/.test(query.q.trim())
          ? eq(sales.number, Number(query.q.trim()))
          : sql`false`,
      )
      .limit(4),
    db
      .select({ id: suppliers.id, name: suppliers.legalName })
      .from(suppliers)
      .where(or(ilike(suppliers.legalName, term), ilike(suppliers.tradeName, term)))
      .limit(4),
  ]);

  return ok({
    products: productRows.map((p) => ({
      id: p.id,
      name: p.name,
      reference: p.reference,
      price: money(p.price),
      stock: Number(p.stock),
    })),
    customers: customerRows,
    sales: saleRows.map((s) => ({ ...s, total: money(s.total) })),
    suppliers: supplierRows.map((s) => ({ id: s.id, name: s.name })),
  });
});
