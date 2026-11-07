import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { effectivePermissions, ROLE_LABELS, type UserRole } from "@/server/auth/permissions";
import { toPublicError } from "@/server/lib/errors";
import { writeAudit } from "@/server/lib/audit";

const schema = z.object({
  email: z.string().min(1, "Informe o e-mail.").max(255),
  password: z.string().min(1, "Informe a senha."),
});

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", code: "VALIDATION_ERROR" },
        { status: 422 },
      );
    }
    const { email, password } = parsed.data;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent");

    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);
    const user = rows[0];

    // Mensagem genérica: não revelar se o e-mail existe
    const invalid = NextResponse.json(
      { error: "E-mail ou senha incorretos.", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );

    if (!user) {
      await writeAudit({
        action: "LOGIN_FAILED",
        entity: "auth",
        description: `Tentativa de login com e-mail inexistente: ${email}`,
        ip,
      });
      return invalid;
    }
    if (!user.isActive) {
      return NextResponse.json(
        { error: "Este usuário está inativo. Contate o administrador.", code: "USER_INACTIVE" },
        { status: 403 },
      );
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        {
          error: `Conta temporariamente bloqueada por tentativas inválidas. Tente novamente em ${LOCK_MINUTES} minutos.`,
          code: "USER_LOCKED",
        },
        { status: 429 },
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedAttempts + 1;
      await db
        .update(users)
        .set({
          failedAttempts: attempts,
          lockedUntil:
            attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        })
        .where(sql`${users.id} = ${user.id}`);
      await writeAudit({
        userId: user.id,
        userName: user.name,
        action: "LOGIN_FAILED",
        entity: "auth",
        entityId: user.id,
        description: `Senha incorreta (tentativa ${attempts}/${MAX_ATTEMPTS})`,
        ip,
      });
      return invalid;
    }

    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(sql`${users.id} = ${user.id}`);

    await createSession({ userId: user.id, ip, userAgent });

    await writeAudit({
      userId: user.id,
      userName: user.name,
      action: "LOGIN_SUCCESS",
      entity: "auth",
      entityId: user.id,
      description: "Login realizado com sucesso",
      ip,
      userAgent,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role as UserRole],
        permissions: effectivePermissions({
          role: user.role as UserRole,
          extraPermissions: user.extraPermissions,
          deniedPermissions: user.deniedPermissions,
        }),
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
