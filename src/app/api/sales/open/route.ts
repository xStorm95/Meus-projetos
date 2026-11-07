import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { customers, saleItems, sales, productVariants, products } from "@/server/db/schema";
import { finalizeOpenSale } from "@/server/services/sales";
import { getSettingsCached } from "@/server/services/settings";
import { discountLimitFor } from "@/server/auth/permissions";

export const GET = apiHandler({ permission: "sales.view" }, async ({ user }) => {
  const rows = await db
    .select({
      id: sales.id,
      number: sales.number,
      total: sales.total,
      itemCount: sales.itemCount,
      createdAt: sales.createdAt,
      customerName: customers.name,
      notes: sales.notes,
      sellerId: sales.sellerId,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.status, "OPEN"), isNull(sales.canceledAt)))
    .orderBy(desc(sales.createdAt))
    .limit(50);

  const items = await db
    .select({
      saleId: saleItems.saleId,
      description: saleItems.description,
      sku: saleItems.sku,
      colorName: saleItems.colorName,
      sizeName: saleItems.sizeName,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      total: saleItems.total,
      variantId: saleItems.variantId,
      variantSku: productVariants.sku,
      productName: products.name,
      stockQty: productVariants.stockQty,
    })
    .from(saleItems)
    .leftJoin(productVariants, eq(productVariants.id, saleItems.variantId))
    .leftJoin(products, eq(products.id, saleItems.productId))
    .where(sql`${saleItems.saleId} IN (SELECT id FROM sales WHERE status = 'OPEN')`);

  return ok({
    items: rows.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      isMine: s.sellerId === user.id,
      lines: items.filter((i) => i.saleId === s.id),
    })),
  });
});

export const POST = apiHandler(
  {
    permission: "sales.create",
    body: z.object({
      saleId: z.string().uuid(),
      payments: z
        .array(
          z.object({
            method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "TRANSFER", "OTHER"]),
            amount: z.union([z.string(), z.number()]),
            installments: z.number().int().min(1).max(36).optional(),
            tenderedAmount: z.union([z.string(), z.number()]).optional(),
            firstDueDate: z.string().optional(),
          }),
        )
        .min(1),
    }),
  },
  async ({ body, user }) => {
    const settings = await getSettingsCached();
    const result = await finalizeOpenSale({
      saleId: body.saleId,
      payments: body.payments,
      actor: {
        id: user.id,
        name: user.name,
        maxDiscountPercent: discountLimitFor(user.role, settings),
        canUnlimitedDiscount: user.permissions.includes("sales.discount.unlimited"),
        canNegativeStock: user.permissions.includes("stock.negative.allow"),
      },
    });
    return ok({ sale: result.sale, change: result.change });
  },
);
