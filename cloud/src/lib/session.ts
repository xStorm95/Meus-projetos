/**
 * Sessões: criação, leitura via cookie e revogação.
 * O token nunca é gravado em claro — só o SHA-256 dele.
 */
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions } from "@/db/schema";
import { createToken, hashToken, SESSION_COOKIE, SESSION_HOURS, sessionExpiry } from "./auth";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export type SessionAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  document: string | null;
  birthDate: string | null;
  city: string | null;
  bio: string | null;
  avatar: string | null;
  avatarUpdatedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type SessionMeta = {
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
};

export function toSessionAccount(row: typeof accounts.$inferSelect): SessionAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    document: row.document,
    birthDate: row.birthDate,
    city: row.city,
    bio: row.bio,
    avatar: row.avatar,
    avatarUpdatedAt: row.avatarUpdatedAt ? row.avatarUpdatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}

/** Cria a sessão no banco e grava o cookie HttpOnly. */
export async function startSession(accountId: string, request?: Request): Promise<void> {
  const { token, tokenHash } = createToken();
  const expiresAt = sessionExpiry();

  await db.insert(sessions).values({
    accountId,
    tokenHash,
    expiresAt,
    ip: request ? (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 60) || null : null,
    userAgent: request ? (request.headers.get("user-agent") ?? "").slice(0, 300) || null : null,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    ...cookieOptions,
    expires: expiresAt,
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Conta autenticada (ou null). Também limpa sessões vencidas. */
export async function getSession(): Promise<{ account: SessionAccount; session: SessionMeta } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ account: accounts, session: sessions })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const found = rows[0];
  if (!found || !found.account.isActive) return null;

  return {
    account: toSessionAccount(found.account),
    session: {
      createdAt: found.session.createdAt.toISOString(),
      expiresAt: found.session.expiresAt.toISOString(),
      userAgent: found.session.userAgent,
    },
  };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    const error = new Error("Sessão expirada. Entre novamente.");
    error.name = "Unauthorized";
    throw error;
  }
  return session;
}

/** Remove sessões expiradas (chamado no login para manter a tabela enxuta). */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Sessões abertas da conta (para a tela de segurança). */
export async function listSessions(accountId: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.accountId, accountId))
    .orderBy(sessions.createdAt);

  return rows
    .filter((row) => row.expiresAt.getTime() > Date.now())
    .map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      userAgent: row.userAgent,
      ip: row.ip,
    }));
}
