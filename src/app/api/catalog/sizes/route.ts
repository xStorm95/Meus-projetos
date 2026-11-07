import { z } from "zod";
import { asc } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { sizes } from "@/server/db/schema";

export const GET = apiHandler({}, async () => {
  const rows = await db.select().from(sizes).orderBy(asc(sizes.sortOrder), asc(sizes.name));
  return ok({ items: rows });
});

export const POST = apiHandler(
  {
    permission: ["products.create", "settings.manage"],
    body: z.object({ name: z.string().trim().min(1).max(20) }),
  },
  async ({ body }) => {
    const [created] = await db.insert(sizes).values({ name: body.name }).returning();
    return ok({ item: created }, { status: 201 });
  },
);
