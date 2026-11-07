import { apiHandler, ok } from "@/server/lib/api";
import { getSessionSummary } from "@/server/services/cash";
import { db } from "@/server/db/client";
import { cashSessions, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@/server/lib/errors";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "cash.view" },
  async ({ params }) => {
    const summary = await getSessionSummary(params.id);
    const rows = await db
      .select({ session: cashSessions, userName: users.name })
      .from(cashSessions)
      .leftJoin(users, eq(users.id, cashSessions.userId))
      .where(eq(cashSessions.id, params.id))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Caixa");
    return ok({ ...summary, session: rows[0].session, operatorName: rows[0].userName });
  },
);
