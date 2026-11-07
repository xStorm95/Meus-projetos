/**
 * Executa operações assumindo que o schema existe.
 * Se o banco tiver sido recriado (tabela ausente), recria o schema e tenta de novo uma vez.
 */
import { ensureSchema, resetSchemaCache } from "./migrate";

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = (err as Error)?.message ?? "";
  return code === "42P01" || /relation .* does not exist/i.test(message);
}

export async function withSchema<T>(fn: () => Promise<T>): Promise<T> {
  await ensureSchema();
  try {
    return await fn();
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    resetSchemaCache();
    await ensureSchema();
    return fn();
  }
}
