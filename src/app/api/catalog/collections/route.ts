import { z } from "zod";
import { asc } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { collections } from "@/server/db/schema";

export const GET = apiHandler({}, async () => {
  const rows = await db.select().from(collections).orderBy(asc(collections.name));
  return ok({ items: rows });
});

export const POST = apiHandler(
  {
    permission: ["products.create", "settings.manage"],
    body: z.object({
      name: z.string().trim().min(1).max(60),
      year: z.number().int().min(2000).max(2100).optional(),
      season: z.string().max(20).optional(),
    }),
  },
  async ({ body }) => {
    const [created] = await db
      .insert(collections)
      .values({ name: body.name, year: body.year ?? null, season: body.season ?? null })
      .returning();
    return ok({ item: created }, { status: 201 });
  },
);
