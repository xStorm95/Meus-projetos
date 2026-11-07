/**
 * Serviço de usuários e permissões.
 * - Senha nunca é devolvida; hash scrypt com parâmetros de custo.
 * - Não permite remover o último ADMIN ativo (evita lockout).
 * - Permissões individuais (grant/deny) complementam o perfil.
 */
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs, sessions, users } from "../db/schema";
import { BusinessRuleError, ConflictError, NotFoundError } from "../lib/errors";
import { hashPassword } from "../auth/password";
import { ALL_PERMISSIONS, effectivePermissions, ROLE_LABELS, ROLE_PERMISSIONS, type UserRole } from "../auth/permissions";
import { writeAudit } from "../lib/audit";

export type UserInput = {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  phone?: string | null;
  commissionRate?: number;
  monthlyGoal?: number;
  isActive?: boolean;
  extraPermissions?: string[];
  deniedPermissions?: string[];
  mustChangePassword?: boolean;
};

const PASSWORD_MIN = 8;

function assertPassword(password: string) {
  if (password.length < PASSWORD_MIN) {
    throw new BusinessRuleError(`A senha deve ter ao menos ${PASSWORD_MIN} caracteres.`);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new BusinessRuleError("A senha deve conter letras e números.");
  }
}

export async function listUsers(params: { search?: string; role?: string; status?: string } = {}) {
  const conds = [];
  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    conds.push(or(sql`lower(${users.name}) LIKE ${term}`, sql`lower(${users.email}) LIKE ${term}`)!);
  }
  if (params.role && params.role !== "ALL") conds.push(eq(users.role, params.role as never));
  if (params.status === "ACTIVE") conds.push(eq(users.isActive, true));
  if (params.status === "INACTIVE") conds.push(eq(users.isActive, false));

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      phone: users.phone,
      commissionRate: users.commissionRate,
      monthlyGoal: users.monthlyGoal,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      failedAttempts: users.failedAttempts,
      lockedUntil: users.lockedUntil,
      extraPermissions: users.extraPermissions,
      deniedPermissions: users.deniedPermissions,
      createdAt: users.createdAt,
      salesCount: sql<number>`(SELECT COUNT(*)::int FROM sales WHERE seller_id = ${users.id} AND status = 'COMPLETED')`,
      lastSaleAt: sql<string | null>`(SELECT MAX(completed_at)::text FROM sales WHERE seller_id = ${users.id} AND status = 'COMPLETED')`,
    })
    .from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    ...row,
    roleLabel: ROLE_LABELS[row.role as UserRole] ?? row.role,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    permissions: effectivePermissions({
      role: row.role as UserRole,
      extraPermissions: row.extraPermissions,
      deniedPermissions: row.deniedPermissions,
    }),
    basePermissions: ROLE_PERMISSIONS[row.role as UserRole] ?? [],
    salesCount: Number(row.salesCount ?? 0),
  }));
}

export async function createUser(input: UserInput, actor: { id: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BusinessRuleError("E-mail inválido.");
  if (!input.password) throw new BusinessRuleError("Informe a senha inicial.");
  assertPassword(input.password);

  const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (existing[0]) throw new ConflictError("Já existe um usuário com este e-mail.");

  const [created] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      phone: input.phone || null,
      commissionRate: String(input.commissionRate ?? 0),
      monthlyGoal: String(input.monthlyGoal ?? 0),
      isActive: input.isActive ?? true,
      mustChangePassword: input.mustChangePassword ?? true,
      extraPermissions: (input.extraPermissions ?? []).filter((p) => ALL_PERMISSIONS.includes(p as never)),
      deniedPermissions: (input.deniedPermissions ?? []).filter((p) => ALL_PERMISSIONS.includes(p as never)),
    })
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "USER_CREATE",
    entity: "user",
    entityId: created.id,
    description: `Usuário criado: ${created.name} (${ROLE_LABELS[input.role]}) — ${created.email}`,
  });

  return { id: created.id, name: created.name, email: created.email, role: created.role };
}

export async function updateUser(
  id: string,
  input: Partial<UserInput>,
  actor: { id: string; name: string },
) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const current = rows[0];
  if (!current) throw new NotFoundError("Usuário");

  // Evita ficar sem administrador ativo
  if (current.role === "ADMIN" && input.role && input.role !== "ADMIN") {
    const admins = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true), ne(users.id, id)));
    if (Number(admins[0]?.count ?? 0) === 0) {
      throw new BusinessRuleError("É necessário manter ao menos um administrador ativo.");
    }
  }
  if (current.role === "ADMIN" && input.isActive === false) {
    const admins = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true), ne(users.id, id)));
    if (Number(admins[0]?.count ?? 0) === 0) {
      throw new BusinessRuleError("É necessário manter ao menos um administrador ativo.");
    }
  }

  let passwordHash: string | undefined;
  if (input.password) {
    assertPassword(input.password);
    passwordHash = await hashPassword(input.password);
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.commissionRate !== undefined ? { commissionRate: String(input.commissionRate) } : {}),
      ...(input.monthlyGoal !== undefined ? { monthlyGoal: String(input.monthlyGoal) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.mustChangePassword !== undefined ? { mustChangePassword: input.mustChangePassword } : {}),
      ...(input.extraPermissions
        ? { extraPermissions: input.extraPermissions.filter((p) => ALL_PERMISSIONS.includes(p as never)) }
        : {}),
      ...(input.deniedPermissions
        ? { deniedPermissions: input.deniedPermissions.filter((p) => ALL_PERMISSIONS.includes(p as never)) }
        : {}),
      updatedAt: new Date(),
      // Desbloqueia ao redefinir senha
      ...(passwordHash ? { failedAttempts: 0, lockedUntil: null } : {}),
    })
    .where(eq(users.id, id))
    .returning();

  // Revoga sessões se senha/status/perfil mudou
  if (passwordHash || input.isActive === false) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), sql`${sessions.revokedAt} IS NULL`));
  }

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "USER_UPDATE",
    entity: "user",
    entityId: id,
    description: `Usuário atualizado: ${updated.name} (${ROLE_LABELS[updated.role as UserRole]})${passwordHash ? " — senha redefinida" : ""}`,
    before: { name: current.name, role: current.role, isActive: current.isActive },
    after: { name: updated.name, role: updated.role, isActive: updated.isActive },
  });

  return { id: updated.id };
}

export async function resetUserPassword(id: string, password: string, actor: { id: string; name: string }) {
  assertPassword(password);
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Usuário");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, id));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), sql`${sessions.revokedAt} IS NULL`));
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "USER_PASSWORD_RESET",
    entity: "user",
    entityId: id,
    description: `Senha redefinida para ${rows[0].name}; troca obrigatória no próximo acesso.`,
  });
  return { ok: true };
}

export async function toggleUserActive(id: string, isActive: boolean, actor: { id: string; name: string }) {
  return updateUser(id, { isActive }, actor);
}

/** Sessões ativas (para auditoria de segurança). */
export async function listActiveSessions(limit = 50) {
  const rows = await db.execute(sql`
    SELECT s.id, s.user_id, u.name AS user_name, u.email, s.ip, s.user_agent,
           s.created_at, s.expires_at, s.revoked_at
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > now()
     ORDER BY s.created_at DESC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    email: String(r.email),
    ip: r.ip ? String(r.ip) : null,
    userAgent: r.user_agent ? String(r.user_agent) : null,
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  }));
}

export async function revokeSession(sessionId: string, actor: { id: string; name: string }) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "SESSION_REVOKE",
    entity: "session",
    entityId: sessionId,
    description: "Sessão revogada manualmente pelo administrador.",
  });
  return { ok: true };
}

export async function recentAudit(limit = 100) {
  const rows = await db.select().from(auditLogs).orderBy(sql`${auditLogs.createdAt} DESC`).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    userName: r.userName,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    description: r.description,
    ip: r.ip,
  }));
}

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
  permissionCount: (ROLE_PERMISSIONS[role] ?? []).length,
}));
