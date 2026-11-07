/**
 * Trilha de auditoria — registra QUEM fez O QUE, QUANDO e com quais valores.
 * Chamada em todas as operações sensíveis (vendas, cancelamentos, preços,
 * estoque, financeiro, permissões, configurações).
 */
import { db, type Database } from "../db/client";
import { auditLogs } from "../db/schema";

/** Executor de banco: conexão direta ou transação em andamento. */
export type AuditExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AuditInput = {
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  description?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/** Remove dados sensíveis antes de gravar. */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  const clone = JSON.parse(JSON.stringify(value));
  const sensitiveKeys = ["password", "passwordHash", "senha", "token", "tokenHash", "cvv"];
  const walk = (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        obj[key] = "***";
      } else if (obj[key] && typeof obj[key] === "object") {
        walk(obj[key] as Record<string, unknown>);
      }
    }
  };
  if (typeof clone === "object") walk(clone as Record<string, unknown>);
  return clone;
}

export async function writeAudit(input: AuditInput, executor?: AuditExecutor): Promise<void> {
  try {
    const target = executor ?? db;
    await target.insert(auditLogs).values({
      userId: input.userId ?? null,
      userName: input.userName ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      description: input.description ?? null,
      before: sanitize(input.before) as never,
      after: sanitize(input.after) as never,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    // Auditoria nunca deve derrubar a operação principal
    console.error("[audit] falha ao registrar:", err);
  }
}
