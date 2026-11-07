import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { passwordResetTokens, sessions, users } from "@/server/db/schema";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { toPublicError, ValidationError } from "@/server/lib/errors";
import { writeAudit } from "@/server/lib/audit";

const schema = z.object({
  token: z.string().min(10, "Token inválido."),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);

    const strength = validatePasswordStrength(parsed.data.password);
    if (strength) throw new ValidationError(strength);

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const token = rows[0];
    if (!token) {
      throw new ValidationError("Link de redefinição inválido ou expirado. Solicite um novo.");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(parsed.data.password),
          mustChangePassword: false,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, token.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));
      // Encerra todas as sessões existentes por segurança
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.userId, token.userId));
    });

    await writeAudit({
      userId: token.userId,
      action: "PASSWORD_RESET",
      entity: "user",
      entityId: token.userId,
      description: "Senha redefinida via link de recuperação",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
