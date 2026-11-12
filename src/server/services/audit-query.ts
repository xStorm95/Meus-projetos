/**
 * Consulta de auditoria com filtros (usuário, ação, entidade, período).
 * Nenhum registro de auditoria é editável ou excluível pela aplicação.
 */
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs, users } from "../db/schema";
import { addDaysKey, inicioDoDia } from "../lib/dates";

export async function queryAudit(params: {
  search?: string;
  action?: string;
  entity?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 50);
  const conds = [];
  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    conds.push(
      or(
        sql`lower(${auditLogs.description}) LIKE ${term}`,
        sql`lower(${auditLogs.userName}) LIKE ${term}`,
        sql`lower(${auditLogs.action}) LIKE ${term}`,
        sql`lower(${auditLogs.entity}) LIKE ${term}`,
      )!,
    );
  }
  if (params.action && params.action !== "ALL") conds.push(eq(auditLogs.action, params.action));
  if (params.entity && params.entity !== "ALL") conds.push(eq(auditLogs.entity, params.entity));
  if (params.userId) conds.push(eq(auditLogs.userId, params.userId));
  if (params.from) conds.push(gte(auditLogs.createdAt, inicioDoDia(params.from)));
  if (params.to) conds.push(lt(auditLogs.createdAt, inicioDoDia(addDaysKey(params.to, 1))));
  const where = conds.length ? and(...conds) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        today: sql<number>`COUNT(*) FILTER (WHERE ${auditLogs.createdAt} >= CURRENT_DATE)::int`,
        users: sql<number>`COUNT(DISTINCT ${auditLogs.userId})::int`,
      })
      .from(auditLogs)
      .where(where),
  ]);

  return {
    items: items.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userName: row.userName,
      userId: row.userId,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      description: row.description,
      ip: row.ip,
      before: row.before,
      after: row.after,
    })),
    total: Number(totals[0]?.count ?? 0),
    totals: {
      today: Number(totals[0]?.today ?? 0),
      users: Number(totals[0]?.users ?? 0),
    },
    page,
    pageSize,
  };
}

export async function auditFacets() {
  const [actions, entities, userRows] = await Promise.all([
    db.execute(sql`SELECT action, COUNT(*)::int AS total FROM audit_logs GROUP BY action ORDER BY COUNT(*) DESC LIMIT 60`),
    db.execute(sql`SELECT entity, COUNT(*)::int AS total FROM audit_logs GROUP BY entity ORDER BY COUNT(*) DESC LIMIT 40`),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .orderBy(users.name),
  ]);
  return {
    actions: (actions.rows as Array<Record<string, unknown>>).map((r) => ({
      value: String(r.action),
      total: Number(r.total ?? 0),
    })),
    entities: (entities.rows as Array<Record<string, unknown>>).map((r) => ({
      value: String(r.entity),
      total: Number(r.total ?? 0),
    })),
    users: userRows,
  };
}
