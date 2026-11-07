import { eq } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import {
  cashMovements, customers, receivables, saleItems, salePayments, sales, users,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "sales.view" },
  async ({ params }) => {
    const rows = await db
      .select({
        sale: sales,
        customerName: customers.name,
        customerDocument: customers.document,
        customerPhone: customers.phone,
        sellerName: users.name,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.sellerId))
      .where(eq(sales.id, params.id))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Venda");
    const [items, payments, recs, cash] = await Promise.all([
      db.select().from(saleItems).where(eq(saleItems.saleId, params.id)),
      db.select().from(salePayments).where(eq(salePayments.saleId, params.id)),
      db.select().from(receivables).where(eq(receivables.saleId, params.id)),
      db.select().from(cashMovements).where(eq(cashMovements.referenceId, params.id)),
    ]);
    return ok({ ...rows[0], items, payments, receivables: recs, cashMovements: cash });
  },
);
