import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { categories } from "@/server/db/schema";

export const GET = apiHandler({}, async () => {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      isActive: categories.isActive,
      productCount: sql<number>`(SELECT COUNT(*) FROM products p WHERE p.category_id = ${categories.id} AND p.deleted_at IS NULL)::int`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return ok({ items: rows });
});

export const POST = apiHandler(
  {
    permission: ["products.create", "settings.manage"],
    body: z.object({
      name: z.string().trim().min(2).max(80),
      parentId: z.string().uuid().nullable().optional(),
    }),
  },
  async ({ body }) => {
    const [created] = await db
      .insert(categories)
      .values({ name: body.name, parentId: body.parentId ?? null })
      .returning();
    return ok({ item: created }, { status: 201 });
  },
);

export const PATCH = apiHandler(
  {
    permission: ["products.update", "settings.manage"],
    body: z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(80) }),
  },
  async ({ body }) => {
    const [updated] = await db
      .update(categories)
      .set({ name: body.name })
      .where(eq(categories.id, body.id))
      .returning();
    return ok({ item: updated });
  },
);
