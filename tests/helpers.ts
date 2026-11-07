/**
 * Utilitários de teste.
 * Os testes rodam contra o PostgreSQL de desenvolvimento já migrado
 * (PGlite via scripts/db-server.ts). Nenhum mock de banco é usado: as regras
 * são validadas contra o banco real, como em produção.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export type TestActor = { id: string; name: string };

export async function ensureTestSchema() {
  const result = await db.execute(
    sql`SELECT to_regclass('public.settings') IS NOT NULL AS ok`,
  );
  const ok = (result.rows as Array<{ ok: boolean }>)[0]?.ok;
  if (!ok) throw new Error("Banco não migrado. Rode `npm run db:migrate` antes dos testes.");
}

let cachedAdmin: TestActor | null = null;

/** Administrador ativo existente (necessário para auditoria de FKs). */
export async function adminActor(): Promise<TestActor> {
  if (cachedAdmin) return cachedAdmin;
  const rows = await db.execute(
    sql`SELECT id, name FROM users WHERE role = 'ADMIN' AND is_active = true ORDER BY created_at LIMIT 1`,
  );
  const row = (rows.rows as Array<{ id: string; name: string }>)[0];
  if (!row) throw new Error("Nenhum administrador ativo. Rode `npm run admin:create` antes dos testes.");
  cachedAdmin = { id: row.id, name: row.name };
  return cachedAdmin;
}

/** Prefixo único por execução para não colidir com dados de demonstração. */
export function stamp(prefix: string) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
}

export async function purgeTestData(markers: string[]) {
  for (const marker of markers) {
    await db.execute(sql`
      DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE notes LIKE ${`%${marker}%`})
    `);
    await db.execute(sql`DELETE FROM sales WHERE notes LIKE ${`%${marker}%`}`);
    await db.execute(sql`
      DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE notes LIKE ${`%${marker}%`})
    `);
    await db.execute(sql`
      DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE notes LIKE ${`%${marker}%`})
    `);
    await db.execute(sql`DELETE FROM products WHERE notes LIKE ${`%${marker}%`}`);
    await db.execute(sql`
      DELETE FROM receivables WHERE customer_id IN (SELECT id FROM customers WHERE notes LIKE ${`%${marker}%`})
    `);
    await db.execute(sql`DELETE FROM customers WHERE notes LIKE ${`%${marker}%`}`);
    await db.execute(sql`DELETE FROM suppliers WHERE notes LIKE ${`%${marker}%`}`);
    await db.execute(sql`DELETE FROM payables WHERE notes LIKE ${`%${marker}%`}`);
    await db.execute(sql`DELETE FROM audit_logs WHERE description LIKE ${`%${marker}%`}`);
  }
}

export { db, sql };
