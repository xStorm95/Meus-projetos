import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { fail, ok, unauthorized } from "@/lib/api";
import { getSession, toSessionAccount } from "@/lib/session";
import { isAcceptableAvatar } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Salva a foto (data URL já redimensionada no navegador, máx. ~700 KB). */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Dados inválidos.");
  }

  const avatar = String(body.avatar ?? "");
  if (!isAcceptableAvatar(avatar)) {
    return fail("Envie uma imagem JPG, PNG ou WEBP de até 500 KB.", 413, {
      avatar: "Imagem inválida ou muito grande.",
    });
  }

  try {
    const [updated] = await db
      .update(accounts)
      .set({ avatar, avatarUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(accounts.id, session.account.id))
      .returning();
    return ok({ account: toSessionAccount(updated), saved: true });
  } catch (err) {
    console.error("[avatar]", (err as Error).message);
    return fail("Não conseguimos salvar a foto. Tente novamente.", 500);
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorized();
  const [updated] = await db
    .update(accounts)
    .set({ avatar: null, avatarUpdatedAt: null, updatedAt: new Date() })
    .where(eq(accounts.id, session.account.id))
    .returning();
  return ok({ account: toSessionAccount(updated) });
}
