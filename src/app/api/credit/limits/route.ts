import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { customers } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { money } from "@/server/lib/money";
import { writeAudit } from "@/server/lib/audit";

const schema = z.object({
  customerId: z.string().uuid(),
  creditLimit: z.union([z.string(), z.number()]),
  reason: z.string().max(300).optional(),
});

export const PATCH = apiHandler({ permission: "credit.limit.update", body: schema }, async ({ body, user }) => {
  const rows = await db.select().from(customers).where(eq(customers.id, body.customerId)).limit(1);
  if (!rows[0]) throw new NotFoundError("Cliente");
  const [updated] = await db
    .update(customers)
    .set({ creditLimit: money(body.creditLimit), updatedAt: new Date() })
    .where(eq(customers.id, body.customerId))
    .returning();

  await writeAudit({
    userId: user.id,
    userName: user.name,
    action: "CREDIT_LIMIT_UPDATE",
    entity: "customer",
    entityId: body.customerId,
    description: `Limite de crédito de ${rows[0].name}: R$ ${rows[0].creditLimit} → R$ ${updated.creditLimit}${body.reason ? ` (${body.reason})` : ""}`,
    before: { creditLimit: rows[0].creditLimit },
    after: { creditLimit: updated.creditLimit },
  });

  return ok({ customer: { id: updated.id, creditLimit: updated.creditLimit } });
});
