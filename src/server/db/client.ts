/**
 * Conexão com o banco (PostgreSQL via driver pg + Drizzle ORM).
 * Funciona com qualquer PostgreSQL compatível (local, Neon, Supabase, RDS...).
 * Em desenvolvimento neste ambiente, um PostgreSQL real roda embutido via
 * PGlite no script scripts/db-server.ts e é acessado por TCP normalmente.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "../env";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __passarelaPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __passarelaDb: Database | undefined;
}

function buildPool(): Pool {
  const e = env();
  return new Pool({
    connectionString: e.DATABASE_URL,
    max: e.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: false,
  });
}

export function getPool(): Pool {
  if (!global.__passarelaPool) {
    global.__passarelaPool = buildPool();
    global.__passarelaPool.on("error", (err) => {
      console.error("[db] erro inesperado no pool de conexões:", err.message);
    });
  }
  return global.__passarelaPool;
}

export function getDb(): Database {
  if (!global.__passarelaDb) {
    global.__passarelaDb = drizzle(getPool(), { schema, logger: process.env.DB_LOG === "1" });
  }
  return global.__passarelaDb;
}

/** Proxy para uso conveniente: db.select()... */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as Database;

export { schema };
