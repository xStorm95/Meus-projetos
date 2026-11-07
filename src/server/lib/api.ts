/**
 * Camada de API: autenticação, permissões, validação com Zod, tratamento de
 * erros e auditoria. Todas as rotas /api passam por aqui — nenhuma rota
 * acessa o banco sem verificar sessão e permissão.
 */
import { NextRequest, NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { getCurrentUser, type SessionUser } from "../auth/session";
import { ForbiddenError, toPublicError, UnauthorizedError, ValidationError } from "./errors";
import type { Permission } from "../auth/permissions";
import { writeAudit, type AuditInput } from "./audit";

export type RouteContext<TParams> = { params: Promise<TParams> };

type HandlerArgs<TBody, TQuery, TParams> = {
  req: NextRequest;
  user: SessionUser;
  body: TBody;
  query: TQuery;
  params: TParams;
  ip: string | null;
};

export type ApiOptions<TBody, TQuery, TParams> = {
  /** Permissão necessária (verificada no servidor, nunca no cliente) */
  permission?: Permission | Permission[];
  /** Esquema de validação do corpo JSON */
  body?: ZodType<TBody, ZodTypeDef, unknown>;
  /** Esquema de validação da query string */
  query?: ZodType<TQuery, ZodTypeDef, unknown>;
  /** Permitir acesso sem autenticação (login, health check) */
  public?: boolean;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function fail(status: number, error: string, code = "ERROR", details?: unknown) {
  return NextResponse.json({ error, code, details }, { status });
}

function parseQuery(searchParams: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      const arr = (raw[k] as string[]) ?? [];
      arr.push(value);
      raw[k] = arr;
    } else if (key in raw) {
      const existing = raw[key];
      raw[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      raw[key] = value;
    }
  }
  return raw;
}

export function requirePermission(user: SessionUser, permission?: Permission | Permission[]) {
  if (!permission) return;
  const needed = Array.isArray(permission) ? permission : [permission];
  const hasAny = needed.some((p) => user.permissions.includes(p));
  if (!hasAny) {
    throw new ForbiddenError(
      `Ação não permitida para o seu perfil (${needed.map((p) => p).join(" ou ")}).`,
    );
  }
}

/**
 * Cria um handler de rota com toda a proteção aplicada.
 */
export function apiHandler<TBody = unknown, TQuery = unknown, TParams = unknown>(
  options: ApiOptions<TBody, TQuery, TParams>,
  handler: (args: HandlerArgs<TBody, TQuery, TParams>) => Promise<Response | void>,
) {
  // O segundo parâmetro é tipado como `any` para compatibilidade com as
  // assinaturas validadas pelo Next.js (rotas com e sem segmentos dinâmicos).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: NextRequest, context?: any): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!options.public && !user) throw new UnauthorizedError();
      if (user) requirePermission(user, options.permission);

      let body = undefined as TBody;
      if (options.body) {
        let json: unknown = {};
        try {
          json = await req.json();
        } catch {
          if (req.method !== "GET" && req.method !== "DELETE") {
            throw new ValidationError("Corpo da requisição inválido (JSON esperado).");
          }
        }
        const parsed = options.body.safeParse(json);
        if (!parsed.success) {
          throw new ValidationError(
            parsed.error.issues[0]?.message ?? "Dados inválidos.",
            parsed.error.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          );
        }
        body = parsed.data;
      }

      let query = undefined as TQuery;
      if (options.query) {
        const parsed = options.query.safeParse(parseQuery(req.nextUrl.searchParams));
        if (!parsed.success) {
          throw new ValidationError(
            parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
            parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
          );
        }
        query = parsed.data;
      }

      const params = context?.params ? await context.params : ({} as TParams);
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        null;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await handler({ req, user: user as SessionUser, body, query, params, ip });
      return result ?? NextResponse.json({ ok: true });
    } catch (err) {
      const { status, body } = toPublicError(err);
      return NextResponse.json(body, { status });
    }
  };
}

/** Atalho: valida um corpo JSON avulso dentro de handlers. */
export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

/** Registra auditoria a partir de um handler autenticado. */
export async function audit(user: SessionUser, input: AuditInput, ip?: string | null) {
  return writeAudit({
    ...input,
    userId: user.id,
    userName: user.name,
    ip,
  });
}
