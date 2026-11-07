import { z } from "zod";
import { asc } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { colors } from "@/server/db/schema";

export const GET = apiHandler({}, async () => {
  const rows = await db.select().from(colors).orderBy(asc(colors.sortOrder), asc(colors.name));
  return ok({ items: rows });
});

export const POST = apiHandler(
  {
    permission: ["products.create", "settings.manage"],
    body: z.object({
      name: z.string().trim().min(1).max(40),
      hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB).").default("#cccccc"),
    }),
  },
  async ({ body }) => {
    const [created] = await db
      .insert(colors)
      .values({ name: body.name, hex: body.hex })
      .returning();
    return ok({ item: created }, { status: 201 });
  },
);
