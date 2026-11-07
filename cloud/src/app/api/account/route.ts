import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { verifyPassword } from "@/lib/auth";
import { fail, ok, unauthorized } from "@/lib/api";
import { endSession, getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exclui a própria conta (exige a senha). */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return fail("Informe sua senha para confirmar.");
  }

  const rows = await db.select().from(accounts).where(eq(accounts.id, session.account.id)).limit(1);
  const account = rows[0];
  if (!account) return unauthorized();

  if (!(await verifyPassword(String(body.password ?? ""), account.passwordHash))) {
    return fail("Senha incorreta.", 401, { password: "Senha incorreta." });
  }

  await db.delete(accounts).where(eq(accounts.id, account.id));
  await endSession();
  return ok({ deleted: true });
}
