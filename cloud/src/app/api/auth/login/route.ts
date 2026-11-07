import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { hashPassword, isLocked, lockUntil, MAX_ATTEMPTS, minutesLeft, verifyPassword } from "@/lib/auth";
import { withSchema } from "@/db/guard";
import { fail, ok, tooMany } from "@/lib/api";
import { pruneExpiredSessions, startSession, toSessionAccount } from "@/lib/session";
import { hasErrors, normalizeEmail, validateLogin } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Não conseguimos ler os dados enviados.");
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");

  const errors = validateLogin({ email, password });
  if (hasErrors(errors)) return fail("Confira os campos destacados.", 422, errors);

  try {
    return await withSchema(async () => {
      const rows = await db.select().from(accounts).where(eq(accounts.emailNormalized, email)).limit(1);
      const account = rows[0];

      // Mensagem idêntica para e-mail inexistente e senha errada (evita enumeração).
      if (!account || !account.isActive) {
        await hashPassword(password); // tempo de resposta equivalente
        return fail("E-mail ou senha incorretos.", 401, { password: "E-mail ou senha incorretos." });
      }

      if (isLocked(account.lockedUntil)) {
        const minutes = minutesLeft(account.lockedUntil);
        return tooManyFail(minutes);
      }

      const valid = await verifyPassword(password, account.passwordHash);

      if (!valid) {
        const attempts = account.failedAttempts + 1;
        const shouldLock = attempts >= MAX_ATTEMPTS;
        await db
          .update(accounts)
          .set({
            failedAttempts: shouldLock ? 0 : attempts,
            lockedUntil: shouldLock ? lockUntil() : account.lockedUntil,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, account.id));

        if (shouldLock) return tooManyFail(15);
        const left = MAX_ATTEMPTS - attempts;
        return fail(`E-mail ou senha incorretos. Restam ${left} tentativa(s).`, 401, {
          password: "E-mail ou senha incorretos.",
        });
      }

      await db
        .update(accounts)
        .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(accounts.id, account.id));

      await pruneExpiredSessions();
      await startSession(account.id, request);

      return ok({ account: toSessionAccount({ ...account, lastLoginAt: new Date() }) });
    });
  } catch (err) {
    console.error("[login]", (err as Error).message);
    return fail("Não conseguimos entrar agora. Tente novamente em instantes.", 500);
  }
}

function tooManyFail(minutes: number) {
  return tooMany(
    `Sua conta foi bloqueada por segurança após ${MAX_ATTEMPTS} tentativas. Tente novamente em ${minutes} minuto(s).`,
  );
}
