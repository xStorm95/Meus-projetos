import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { fail, ok, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { hasErrors, validatePasswordStrength } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Dados inválidos.");
  }

  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  const fields: Record<string, string> = {};
  const rows = await db.select().from(accounts).where(eq(accounts.id, session.account.id)).limit(1);
  const account = rows[0];
  if (!account) return unauthorized();

  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    fields.currentPassword = "A senha atual está incorreta.";
  }
  const strength = validatePasswordStrength(newPassword);
  if (strength) fields.newPassword = strength;
  if (newPassword !== confirmPassword) fields.confirmPassword = "As senhas não conferem.";
  if (hasErrors(fields)) return fail("Confira os campos destacados.", 422, fields);

  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(accounts.id, account.id));

  return ok({ updated: true });
}
