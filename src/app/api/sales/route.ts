import { z } from "zod";
import { and, desc, eq, gte, lt, sql, ilike, or } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { customers, sales, users } from "@/server/db/schema";
import { createSale, previewSale } from "@/server/services/sales";
import { discountLimitFor } from "@/server/auth/permissions";
import { getSettingsCached } from "@/server/services/settings";
import { addDaysKey } from "@/server/lib/dates";

const paymentSchema = z.object({
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "TRANSFER", "OTHER"]),
  amount: z.union([z.string(), z.number()]),
  installments: z.number().int().min(1).max(36).optional(),
  tenderedAmount: z.union([z.string(), z.number()]).optional(),
  firstDueDate: z.string().optional(),
  cardBrand: z.string().max(40).optional(),
  authorizationCode: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

const itemSchema = z.object({
  variantId: z.string().uuid("Selecione um produto válido."),
  quantity: z.number().positive("Quantidade deve ser maior que zero."),
  unitPrice: z.union([z.string(), z.number()]).optional(),
  discountAmount: z.union([z.string(), z.number()]).optional(),
  surchargeAmount: z.union([z.string(), z.number()]).optional(),
});

const saleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  sellerId: z.string().uuid().nullable().optional(),
  items: z.array(itemSchema).min(1, "Adicione ao menos um produto."),
  payments: z.array(paymentSchema).default([]),
  discountPercent: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  surchargeAmount: z.number().min(0).optional(),
  discountReason: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
  saveAsOpen: z.boolean().optional(),
  quoteId: z.string().uuid().nullable().optional(),
});

async function actorFrom(user: { id: string; name: string; role: string; permissions: string[] }) {
  const settings = await getSettingsCached();
  return {
    id: user.id,
    name: user.name,
    maxDiscountPercent: discountLimitFor(user.role as never, settings),
    canUnlimitedDiscount:
      user.permissions.includes("sales.discount.unlimited") || user.role === "ADMIN",
    canNegativeStock:
      user.permissions.includes("stock.negative.allow") || settings.allowNegativeStock,
  };
}

/** Preview de totais sem gravar (usado pelo PDV a cada alteração). */
export const PUT = apiHandler(
  { permission: "sales.create", body: saleSchema.omit({ payments: true }).extend({ payments: z.array(paymentSchema).optional() }) },
  async ({ body }) => {
    const preview = await previewSale({
      ...body,
      payments: body.payments ?? [],
    });
    return ok(preview);
  },
);

export const POST = apiHandler(
  { permission: "sales.create", body: saleSchema },
  async ({ body, user }) => {
    const actor = await actorFrom(user);
    const result = await createSale(body, actor);
    return ok(
      {
        sale: {
          id: result.sale.id,
          number: result.sale.number,
          total: result.sale.total,
          status: result.sale.status,
        },
        change: result.change,
        paid: result.paid,
      },
      { status: 201 },
    );
  },
);

export const GET = apiHandler(
  {
    permission: "sales.view",
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  async ({ query, user }) => {
    const conds = [];
    if (query.from) conds.push(gte(sales.createdAt, new Date(`${query.from}T00:00:00Z`)));
    if (query.to) conds.push(lt(sales.createdAt, new Date(`${addDaysKey(query.to, 1)}T00:00:00Z`)));
    if (query.status && query.status !== "ALL") conds.push(eq(sales.status, query.status as never));
    if (query.search) {
      const term = `%${query.search}%`;
      conds.push(
        or(
          ilike(customers.name, term),
          sql`CAST(${sales.number} AS TEXT) LIKE ${term}`,
        )!,
      );
    }
    // Vendedor só vê as próprias vendas, salvo permissão
    if (!user.permissions.includes("sales.view.all") && user.role !== "ADMIN" && user.role !== "MANAGER") {
      conds.push(eq(sales.sellerId, user.id));
    }
    const where = conds.length ? and(...conds) : undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const [items, totals] = await Promise.all([
      db
        .select({
          id: sales.id,
          number: sales.number,
          status: sales.status,
          total: sales.total,
          profit: sales.profit,
          itemCount: sales.itemCount,
          createdAt: sales.createdAt,
          customerName: customers.name,
          sellerName: users.name,
          originType: sales.originType,
        })
        .from(sales)
        .leftJoin(customers, eq(customers.id, sales.customerId))
        .leftJoin(users, eq(users.id, sales.sellerId))
        .where(where)
        .orderBy(desc(sales.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({
          count: sql<number>`COUNT(*)::int`,
          total: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.total} ELSE 0 END), 0)::text`,
          profit: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.profit} ELSE 0 END), 0)::text`,
        })
        .from(sales)
        .leftJoin(customers, eq(customers.id, sales.customerId))
        .where(where),
    ]);

    return ok({
      items,
      total: Number(totals[0]?.count ?? 0),
      summary: { total: totals[0]?.total, profit: totals[0]?.profit },
      page,
      pageSize,
    });
  },
);
