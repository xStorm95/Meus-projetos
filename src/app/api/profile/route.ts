/**
 * Perfil do próprio usuário: ler e atualizar dados básicos.
 * Só mexe na linha do usuário logado — nunca em outra pessoa da loja
 * (para isso existe /api/users/[id], com permissão de administrador).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getCurrentUser } from "@/server/auth/session";
import { toPublicError, UnauthorizedError, ValidationError } from "@/server/lib/errors";
import { writeAudit } from "@/server/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120).optional(),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(30).nullable().optional(),
  ),
  birthDate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .nullable()
      .optional(),
  ),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();
    return NextResponse.json({
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        roleLabel: user.roleLabel,
        companyId: user.companyId,
      },
    });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
    if (parsed.data.birthDate !== undefined) patch.birthDate = parsed.data.birthDate;

    await db.update(users).set(patch).where(eq(users.id, user.id));

    await writeAudit({
      userId: user.id,
      userName: user.name,
      action: "UPDATE",
      entity: "user",
      entityId: user.id,
      description: "Perfil atualizado pelo próprio usuário",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
