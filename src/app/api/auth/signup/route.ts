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
import { companies, settings, users } from "@/server/db/schema";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { writeAudit } from "@/server/lib/audit";
import { normalizeHex, customAccentValue } from "@/server/lib/color";
import { updateSettings } from "@/server/services/settings";
import { toPublicError } from "@/server/lib/errors";
import { uniqueSlug } from "@/server/lib/slug";
import { seedCompanyDefaults } from "@/server/services/company-setup";
import { withCompany } from "@/server/db/tenant";

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

    const accentHex = parsed.data.accentHex ? normalizeHex(parsed.data.accentHex) : null;

    // Cada cadastro cria uma LOJA nova. Todos os dados do dono ficam presos a
    // ela — outra loja nunca enxerga nada daqui.
    const slug = await uniqueSlug(storeName);

    // 1) cria a loja (tabela global — não exige contexto de loja)
    const [company] = await db
      .insert(companies)
      .values({ name: storeName, slug, email: emailNorm })
      .returning({ id: companies.id, name: companies.name, slug: companies.slug });

    // 2) cria o dono DENTRO da loja nova: o guardião carimba company_id
    const passwordHash = await hashPassword(password);
    const created = await withCompany(company.id, async () => {
      const [user] = await db
        .insert(users)
        .values({
          companyId: company.id,
          name: ownerName,
          email: emailNorm,
          passwordHash,
          role: "ADMIN",
          isActive: true,
        })
        .returning({ id: users.id, name: users.name, email: users.email });
      return { user, company };
    });

    // Padrões da loja: tamanhos, cores, categorias, caixa, depósito.
    await seedCompanyDefaults(created.company.id);

    // Identidade visual: nome da loja e a cor da logo escolhida no cadastro.
    await updateSettings({
      companyId: created.company.id,
      appName: storeName.slice(0, 40),
      companyName: storeName,
      companyEmail: emailNorm,
      ...(accentHex ? { accentColor: customAccentValue(accentHex) } : {}),
    });

    await writeAudit({
      companyId: created.company.id,
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
      companyId: created.company.id,
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      ok: true,
      user: { id: created.user.id, name: created.user.name, email: created.user.email },
      store: { id: created.company.id, name: created.company.name, slug: created.company.slug },
    });
  } catch (err) {
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}
