/**
 * Conexão com o PostgreSQL na nuvem (Neon, Supabase, Vercel Postgres, RDS...).
 * Usa o driver `pg` com pool reaproveitado entre invocações serverless.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __contaPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __contaDb: NodePgDatabase<typeof schema> | undefined;
}

export function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada. Veja o README de deployment.");
  return url;
}

export function getPool(): Pool {
  if (!global.__contaPool) {
    const url = connectionString();
    global.__contaPool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 3),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      ssl: /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
    global.__contaPool.on("error", (err) => console.error("[db] erro no pool:", err.message));
  }
  return global.__contaPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!global.__contaDb) global.__contaDb = drizzle(getPool(), { schema });
  return global.__contaDb;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export { schema };
