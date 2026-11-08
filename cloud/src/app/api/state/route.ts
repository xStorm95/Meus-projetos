import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userState } from "@/db/schema";
import { withSchema } from "@/db/guard";
import { ok, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Snapshot completo do estado da conta logada (produtos, vendas, clientes...). */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    return await withSchema(async () => {
      const rows = await db.select().from(userState).where(eq(userState.accountId, session.account.id));
      const state: Record<string, unknown> = {};
      for (const row of rows) state[row.stateKey] = row.value;
      return ok({ state, updatedAt: new Date().toISOString() });
    });
  } catch (err) {
    console.error("[state:get]", (err as Error).message);
    return ok({ state: {}, error: "sem-banco" });
  }
}

/** Apaga todos os dados da conta (mantém a conta e a senha). */
export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorized();
  await withSchema(() => db.delete(userState).where(eq(userState.accountId, session.account.id)));
  return ok({ cleared: true });
}
