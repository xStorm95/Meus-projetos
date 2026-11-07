import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getCurrentUser } from "@/server/auth/session";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { toPublicError, UnauthorizedError, ValidationError } from "@/server/lib/errors";
import { writeAudit } from "@/server/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: z.string().min(8, "A nova senha deve ter no mínimo 8 caracteres."),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();
    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const dbUser = rows[0];
    if (!dbUser) throw new UnauthorizedError();

    const ok = await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash);
    if (!ok) throw new ValidationError("A senha atual está incorreta.");

    const strength = validatePasswordStrength(parsed.data.newPassword);
    if (strength) throw new ValidationError(strength);
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      throw new ValidationError("A nova senha deve ser diferente da atual.");
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await writeAudit({
      userId: user.id,
      userName: user.name,
      action: "PASSWORD_CHANGE",
      entity: "user",
      entityId: user.id,
      description: "Senha alterada pelo próprio usuário",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
