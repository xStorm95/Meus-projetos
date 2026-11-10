/**
 * Erros de aplicação padronizados.
 * Toda regra de negócio violada lança AppError com código HTTP e mensagem
 * em português claro para o usuário final.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, opts: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "AppError";
    this.status = opts.status ?? 400;
    this.code = opts.code ?? "BAD_REQUEST";
    this.details = opts.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Dados inválidos.", details?: unknown) {
    super(message, { status: 422, code: "VALIDATION_ERROR", details });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sessão expirada ou inexistente. Faça login novamente.") {
    super(message, { status: 401, code: "UNAUTHORIZED" });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para executar esta ação.") {
    super(message, { status: 403, code: "FORBIDDEN" });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Registro") {
    super(`${entity} não encontrado(a).`, { status: 404, code: "NOT_FOUND" });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 409, code: "CONFLICT", details });
    this.name = "ConflictError";
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 400, code: "BUSINESS_RULE", details });
    this.name = "BusinessRuleError";
  }
}

/** Converte erros desconhecidos em mensagem amigável, sem vazar detalhes internos. */
export function toPublicError(err: unknown): { status: number; body: { error: string; code: string; details?: unknown } } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: err.message, code: err.code, details: err.details },
    };
  }
  // Erros de constraint do PostgreSQL viram mensagens compreensíveis
  const pg = err as { code?: string; detail?: string; constraint?: string };
  if (pg?.code === "23505" || pg?.code === "23505") {
    return {
      status: 409,
      body: { error: "Já existe um registro com estes dados únicos.", code: "DUPLICATED" },
    };
  }
  if (pg?.code === "23503") {
    return {
      status: 409,
      body: {
        error: "Este registro está em uso por outros lançamentos e não pode ser removido.",
        code: "IN_USE",
      },
    };
  }
  if (pg?.code === "23502") {
    return { status: 422, body: { error: "Campo obrigatório não informado.", code: "REQUIRED" } };
  }
  if (pg?.code === "23505") {
    return { status: 409, body: { error: "Registro duplicado.", code: "DUPLICATED" } };
  }
  /*
   * O Drizzle embrulha o erro do driver: o código 22P02 fica em `cause`.
   * Antes disso, um id malformado na URL (`/api/products/abc`) virava 500.
   */
  const causa = (err as { cause?: { code?: string; message?: string } })?.cause;
  const codigo = pg?.code ?? causa?.code;
  const mensagem = causa?.message ?? (err as Error)?.message ?? "";
  if (codigo === "22P02") {
    // `invalid input syntax for type uuid` = endereço com id inexistente →
    // 404 é a resposta honesta (o recurso não existe).
    if (/uuid/i.test(mensagem)) {
      return { status: 404, body: { error: "Registro não encontrado.", code: "NOT_FOUND" } };
    }
    return { status: 422, body: { error: "Formato de dado inválido.", code: "INVALID_FORMAT" } };
  }
  if (pg?.code === "23514") {
    return {
      status: 422,
      body: { error: "Valor fora dos limites permitidos.", code: "CHECK_VIOLATION" },
    };
  }
  console.error("[erro interno]", err);
  return {
    status: 500,
    body: {
      error: "Erro interno do servidor. Tente novamente ou contate o suporte.",
      code: "INTERNAL",
    },
  };
}
