import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userState } from "@/db/schema";
import { withSchema } from "@/db/guard";
import { fail, ok, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = /^[a-z][a-z0-9_]{0,40}$/;

/** Grava UMA chave do estado do usuário logado. */
export async function PUT(request: Request, context: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { key } = await context.params;
  if (!ALLOWED.test(key)) return fail("Chave inválida.", 400);

  let body: { value?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Dados inválidos.");
  }
  if (body.value === undefined) return fail("Valor ausente.");

  const serialized = JSON.stringify(body.value);
  if (serialized.length > 4 * 1024 * 1024) {
    return fail("Esse conjunto de dados passou de 4 MB. Reduza as fotos dos produtos.", 413);
  }

  try {
    return await withSchema(async () => {
      await db
        .insert(userState)
        .values({ accountId: session.account.id, stateKey: key, value: body.value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [userState.accountId, userState.stateKey],
          set: { value: body.value, updatedAt: new Date() },
        });
      return ok({ saved: true, key });
    });
  } catch (err) {
    console.error("[state:put]", (err as Error).message);
    return fail("Não conseguimos salvar agora. Tente novamente.", 500);
  }
}

/** Apaga uma chave. */
export async function DELETE(_request: Request, context: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { key } = await context.params;
  await withSchema(() =>
    db.delete(userState).where(and(eq(userState.accountId, session.account.id), eq(userState.stateKey, key))),
  );
  return ok({ deleted: true, key });
}
