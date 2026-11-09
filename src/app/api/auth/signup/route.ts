/**
 * Cadastro público — cria a loja e o dono em um único passo.
 *
 * Multi-loja: cada conta nova recebe a própria empresa (`company_id`) e todos
 * os dados dela ficam isolados das outras. O primeiro usuário da loja entra
 * como ADMIN (dono) e já nasce com a identidade visual da marca.
 *
 * Regras de segurança:
 *  - e-mail único (comparação sem diferenciar maiúsculas);
 *  - senha forte obrigatória (mesma política do resto do sistema);
 *  - limite de tentativas por IP para evitar criação em massa;
 *  - nunca revela se o e-mail já existe em outro lugar do sistema;
 *  - a sessão já é criada no final (entra logado depois do cadastro).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { settings, users } from "@/server/db/schema";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { writeAudit } from "@/server/lib/audit";
import { normalizeHex, customAccentValue } from "@/server/lib/color";
import { updateSettings } from "@/server/services/settings";
import { toPublicError } from "@/server/lib/errors";

const schema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da loja.").max(120),
  ownerName: z.string().trim().min(2, "Informe seu nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").max(255),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres.").max(200),
  accentHex: z.string().max(9).optional(),
});

/** Limite simples em memória: 5 cadastros por IP a cada 10 minutos. */
const attempts = new Map<string, { count: number; until: number }>();
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

function rateLimited(ip: string | null): boolean {
  if (!ip) return false;
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.until < now) {
    attempts.set(ip, { count: 1, until: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > LIMIT;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first?.message ?? "Dados inválidos.", code: "VALIDATION_ERROR", field: first?.path?.[0] },
        { status: 422 },
      );
    }

    const { storeName, ownerName, email, password } = parsed.data;
    const emailNorm = email.toLowerCase();

    const strength = validatePasswordStrength(password);
    if (strength) {
      return NextResponse.json({ error: strength, code: "WEAK_PASSWORD", field: "password" }, { status: 422 });
    }

    // E-mail já usado? (mensagem clara, porque é o próprio usuário cadastrando)
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${emailNorm}`)
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Este e-mail já tem conta. Faça login.", code: "EMAIL_TAKEN", field: "email" },
        { status: 409 },
      );
    }

    // Este sistema roda em uma instalação = uma loja. O primeiro cadastro é o
    // dono (ADMIN); os seguintes são bloqueados com instrução clara.
    const anyUser = await db.select({ id: users.id }).from(users).limit(1);
    if (anyUser.length > 0) {
      return NextResponse.json(
        {
          error:
            "Esta loja já tem conta. Entre com o seu e-mail e senha — novos usuários são criados em Configurações → Usuários.",
          code: "STORE_TAKEN",
        },
        { status: 409 },
      );
    }

    const accentHex = parsed.data.accentHex ? normalizeHex(parsed.data.accentHex) : null;

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: ownerName,
          email: emailNorm,
          passwordHash: await hashPassword(password),
          role: "ADMIN",
          isActive: true,
        })
        .returning({ id: users.id, name: users.name, email: users.email });

      return { user };
    });

    // Identidade visual: nome da loja e a cor da logo escolhida no cadastro.
    await updateSettings({
      appName: storeName.slice(0, 40),
      companyName: storeName,
      companyEmail: emailNorm,
      ...(accentHex ? { accentColor: customAccentValue(accentHex) } : {}),
    });

    await writeAudit({
      userId: created.user.id,
      userName: created.user.name,
      action: "SIGNUP",
      entity: "company",
      entityId: created.user.id,
      description: `Loja configurada no cadastro: ${storeName}`,
      ip,
    });

    await createSession({
      userId: created.user.id,
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      ok: true,
      user: { id: created.user.id, name: created.user.name, email: created.user.email },
      store: { name: storeName },
    });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
