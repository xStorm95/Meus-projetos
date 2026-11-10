/**
 * Foto de perfil.
 *
 * Guardada como data URL no próprio registro do usuário (mesma abordagem já
 * usada nas fotos de produto), limitada a ~300 KB depois de comprimida no
 * navegador. Assim a foto não depende de nenhum serviço externo e continua
 * valendo em produção.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getCurrentUser } from "@/server/auth/session";
import { toPublicError, UnauthorizedError, ValidationError } from "@/server/lib/errors";

export const dynamic = "force-dynamic";

/** ~400 KB de texto ≈ 300 KB de imagem em base64. */
const LIMITE = 400_000;

const schema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/, "Envie uma imagem PNG, JPG ou WEBP."),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    if (parsed.data.dataUrl.length > LIMITE) {
      throw new ValidationError("A foto é grande demais. Use uma imagem menor que 300 KB.");
    }

    await db
      .update(users)
      .set({ avatarUrl: parsed.data.dataUrl, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();
    await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
