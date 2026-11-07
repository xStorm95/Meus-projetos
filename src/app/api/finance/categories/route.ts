import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { financeCategories } from "@/server/db/schema";

export const GET = apiHandler({}, async () => {
  const rows = await db.select().from(financeCategories).orderBy(asc(financeCategories.name));
  return ok({ items: rows });
});

export const POST = apiHandler(
  {
    permission: "settings.manage",
    body: z.object({
      name: z.string().trim().min(2).max(80),
      type: z.enum(["INCOME", "EXPENSE"]),
      dreGroup: z.enum(["REVENUE", "DEDUCTION", "COGS", "OPERATING_EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"]),
    }),
  },
  async ({ body }) => {
    const [created] = await db
      .insert(financeCategories)
      .values({ name: body.name, type: body.type, dreGroup: body.dreGroup })
      .returning();
    return ok({ item: created }, { status: 201 });
  },
);

export const DELETE = apiHandler(
  { permission: "settings.manage", body: z.object({ id: z.string().uuid() }) },
  async ({ body }) => {
    await db.update(financeCategories).set({ isActive: false }).where(eq(financeCategories.id, body.id));
    return ok({ ok: true });
  },
);
