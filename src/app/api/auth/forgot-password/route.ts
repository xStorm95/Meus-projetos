import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { passwordResetTokens, users } from "@/server/db/schema";
import { writeAudit } from "@/server/lib/audit";
import { toPublicError } from "@/server/lib/errors";

const schema = z.object({ email: z.string().min(1).max(255) });

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Informe o e-mail." }, { status: 422 });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, eq(users.isActive, true)))
      .limit(1);
    const user = rows[0];

    // Sempre responde com sucesso (evita enumeração de usuários)
    if (user) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
      await writeAudit({
        userId: user.id,
        userName: user.name,
        action: "PASSWORD_RESET_REQUEST",
        entity: "auth",
        entityId: user.id,
        description: "Solicitação de redefinição de senha",
      });
      // Sem provedor de e-mail configurado, o link é exibido apenas no log do
      // servidor (nunca na resposta HTTP), para uso administrativo.
      console.info(
        `[recuperação de senha] ${user.email}: ${process.env.APP_URL ?? "http://localhost:3000"}/redefinir-senha?token=${token}`,
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição. Contate o administrador se não receber o acesso.",
    });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  // Lista pendentes (apenas contagem), usada pelo admin
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(passwordResetTokens)
    .where(and(isNull(passwordResetTokens.usedAt)));
  return NextResponse.json({ pending: Number(rows[0]?.count ?? 0) });
}
