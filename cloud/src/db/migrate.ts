/**
 * Cria as tabelas se ainda não existirem (idempotente — seguro para rodar a cada deploy).
 * O app chama `ensureSchema()` no máximo uma vez por instância.
 */
import { sql } from "drizzle-orm";
import { getDb, getPool } from "./index";

async function runOptional(label: string, statement: () => Promise<unknown>): Promise<string> {
  try {
    await statement();
    return `${label}: ok`;
  } catch (err) {
    return `${label}: ignorado (${(err as Error).message.split("\n")[0]})`;
  }
}

export async function migrate(): Promise<string[]> {
  const db = getDb();
  const applied: string[] = [];

  // gen_random_uuid(): nativo no PG 13+; pgcrypto é só fallback em bancos antigos.
  const extension = await runOptional("extensão pgcrypto", () =>
    db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`),
  );
  applied.push(extension);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(120) NOT NULL,
      email varchar(254) NOT NULL,
      email_normalized varchar(254) NOT NULL,
      password_hash text NOT NULL,
      role varchar(20) NOT NULL DEFAULT 'owner',
      phone varchar(20),
      document varchar(18),
      birth_date varchar(10),
      city varchar(120),
      bio varchar(300),
      avatar text,
      avatar_updated_at timestamptz,
      failed_attempts integer NOT NULL DEFAULT 0,
      locked_until timestamptz,
      last_login_at timestamptz,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  applied.push("tabela accounts");

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx ON accounts (email_normalized)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS accounts_created_idx ON accounts (created_at)`);
  applied.push("índices de accounts");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL,
      ip varchar(64),
      user_agent varchar(300),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )`);
  applied.push("tabela sessions");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_state (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      state_key varchar(64) NOT NULL,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  applied.push("tabela user_state");

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_state_key_idx ON user_state (account_id, state_key)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_state_account_idx ON user_state (account_id)`);
  applied.push("índices de user_state");

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token_hash)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions (account_id)`);
  applied.push("índices de sessions");

  return applied;
}

let schemaPromise: Promise<string[]> | null = null;

/** Garante o schema (uma vez por processo). */
export function ensureSchema(): Promise<string[]> {
  if (!schemaPromise) {
    schemaPromise = migrate().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

/** Esquece o cache (usado quando o banco é recriado). */
export function resetSchemaCache(): void {
  schemaPromise = null;
}

/** Executa como script: npm run db:migrate */
if (process.argv[1] && /migrate\.(ts|js|mjs|cjs)$/.test(process.argv[1])) {
  migrate()
    .then((list) => {
      console.log("[migrate] aplicado:");
      list.forEach((item) => console.log("  - " + item));
      return getPool().end();
    })
    .then(() => console.log("[migrate] banco pronto."))
    .catch((err) => {
      console.error("[migrate] falhou:", err.message);
      process.exit(1);
    });
}
