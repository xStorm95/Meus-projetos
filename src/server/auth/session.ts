/**
 * Sessões seguras baseadas em token opaco + hash do token no banco.
 * - O cookie guarda um token aleatório de 256 bits (nunca o ID da sessão).
 * - No banco é armazenado apenas o SHA-256 do token (vazamento do banco não
 *   permite reutilizar sessões).
 * - Cookie HttpOnly, SameSite=Lax, Secure em produção.
 * - Expiração absoluta (SESSION_TTL_HOURS) e revogação imediata (logout).
 */
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { env } from "../env";
import {
  effectivePermissions,
  ROLE_LABELS,
  type Permission,
  type UserRole,
} from "./permissions";

export const SESSION_COOKIE = "passarela_session";

/**
 * MODO DEMONSTRAÇÃO
 * Quando DEMO_AUTO_LOGIN=true, o sistema entra automaticamente com o usuário
 * administrador ativo mais antigo. Serve para avaliar o ERP sem cadastro.
 * Em produção, mantenha DEMO_AUTO_LOGIN="false" e use a tela de login normal.
 *
 * ATENÇÃO: o acesso automático só vale quando o banco tem UMA loja. Com
 * multi-loja ligado, entrar como "o admin mais antigo" fazia um dono novo cair
 * na loja de outra pessoa (dados de outra empresa na tela). Nesse caso o modo
 * demo é ignorado e a sessão/cadastro valem normalmente.
 */
export function demoAutoLoginEnabled(): boolean {
  return String(process.env.DEMO_AUTO_LOGIN ?? "false") === "true";
}

/**
 * O modo demo só pode ser usado quando existe UMA loja no banco.
 *
 * É uma checagem em runtime (e não uma variável de ambiente) porque o
 * isolamento por loja está sempre ligado: a primeira conta criada é a "dona"
 * do ambiente, então faz sentido continuar entrando nela sem login enquanto
 * não houver mais ninguém. No instante em que a segunda loja é criada, o
 * acesso automático morre e vale o login normal — ninguém cai na loja de
 * outra pessoa.
 */
export async function demoAutoLoginPermitido(): Promise<boolean> {
  if (!demoAutoLoginEnabled()) return false;
  try {
    const { runAsSystem } = await import("../db/tenant");
    const { companies } = await import("../db/schema");
    const rows = await runAsSystem(async () =>
      db.select({ id: companies.id }).from(companies).limit(2),
    );
    return rows.length <= 1;
  } catch {
    return false;
  }
}


async function findDemoUser() {
  const { runAsSystem } = await import("../db/tenant");
  return runAsSystem(findDemoUserUnsafe);
}

async function findDemoUserUnsafe() {
  const admin = await db
    .select({
      id: users.id,
      companyId: users.companyId,
      name: users.name,
      email: users.email,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      extraPermissions: users.extraPermissions,
      deniedPermissions: users.deniedPermissions,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      commissionRate: users.commissionRate,
      monthlyGoal: users.monthlyGoal,
    })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "ADMIN")))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (admin[0]) return admin[0];

  const anyUser = await db
    .select({
      id: users.id,
      companyId: users.companyId,
      name: users.name,
      email: users.email,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      extraPermissions: users.extraPermissions,
      deniedPermissions: users.deniedPermissions,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      commissionRate: users.commissionRate,
      monthlyGoal: users.monthlyGoal,
    })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return anyUser[0] ?? null;
}

/** Monta o objeto de sessão a partir da linha do usuário. */
function toSessionUser(row: {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  extraPermissions: string[];
  deniedPermissions: string[];
  phone: string | null;
  avatarUrl: string | null;
  commissionRate: string;
  monthlyGoal: string;
}): SessionUser {
  const role = row.role as UserRole;
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    email: row.email,
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: effectivePermissions({
      role,
      extraPermissions: row.extraPermissions,
      deniedPermissions: row.deniedPermissions,
    }),
    mustChangePassword: row.mustChangePassword,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    commissionRate: row.commissionRate,
    monthlyGoal: row.monthlyGoal,
  };
}

export type SessionUser = {
  id: string;
  /** Loja do usuário — base de todo isolamento de dados. */
  companyId: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  permissions: Permission[];
  mustChangePassword: boolean;
  phone: string | null;
  /** Foto de perfil (data URL) — null usa as iniciais. */
  avatarUrl: string | null;
  commissionRate: string;
  monthlyGoal: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(params: {
  userId: string;
  companyId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ttlHours = env().SESSION_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);

  // A sessão nasce dentro da loja do usuário (multi-loja).
  const { withCompany } = await import("../db/tenant");
  await withCompany(params.companyId, () =>
    db.insert(sessions).values({
      userId: params.userId,
      companyId: params.companyId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    }),
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const { runAsSystem } = await import("../db/tenant");
    await runAsSystem(() =>
      db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, hashToken(token))),
    );
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Lê a sessão atual. Retorna null se não autenticado ou expirado.
 * Retorna também os dados atualizados do usuário (nunca confie apenas no token).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    if (!(await demoAutoLoginPermitido())) return null;
    // Modo demonstração: entrada automática
    try {
      const demo = await findDemoUser();
      if (!demo) return null;
      return toSessionUser(demo);
    } catch {
      return null;
    }
  }

  // Autenticação é o único caminho que pode cruzar lojas: o token ainda não
  // diz de qual loja é. Depois de encontrar o usuário, tudo roda na loja dele.
  const { runAsSystem } = await import("../db/tenant");
  const rows = await runAsSystem(async () => db
    .select({
      userId: users.id,
      companyId: users.companyId,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      extraPermissions: users.extraPermissions,
      deniedPermissions: users.deniedPermissions,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      commissionRate: users.commissionRate,
      monthlyGoal: users.monthlyGoal,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1));

  const row = rows[0];
  if (!row || !row.isActive) return null;

  // A partir daqui, tudo o que esta requisição fizer no banco roda na loja do
  // usuário. ATENÇÃO: isso vale para o que é executado DENTRO deste escopo
  // assíncrono — no App Router a página é renderizada em outro contexto, por
  // isso as páginas envolvem as consultas em `withCompany(user.companyId)`.
  const { enterCompany } = await import("../db/tenant");
  enterCompany(row.companyId);

  return toSessionUser({
    id: row.userId,
    companyId: row.companyId,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    extraPermissions: row.extraPermissions,
    deniedPermissions: row.deniedPermissions,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    commissionRate: row.commissionRate,
    monthlyGoal: row.monthlyGoal,
  });
}

/** Limpa sessões expiradas (chamado periodicamente). */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await db.execute(
    sql`DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`,
  );
  return result.rowCount ?? 0;
}
