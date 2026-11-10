/**
 * Utilitários de teste.
 * Os testes rodam contra o PostgreSQL de desenvolvimento já migrado
 * (PGlite via scripts/db-server.ts). Nenhum mock de banco é usado: as regras
 * são validadas contra o banco real, como em produção.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { runAsSystem, withCompany } from "@/server/db/tenant";
import { seedCompanyDefaults } from "@/server/services/company-setup";

export type TestActor = { id: string; name: string };

/** Nome/slug da loja usada nos testes de integração. */
export const TEST_COMPANY_SLUG = "loja-de-testes";

export async function ensureTestSchema() {
  const result = await runAsSystem(() =>
    db.execute(sql`SELECT to_regclass('public.settings') IS NOT NULL AS ok`),
  );
  const ok = (result.rows as Array<{ ok: boolean }>)[0]?.ok;
  if (!ok) throw new Error("Banco não migrado. Rode `npm run db:migrate` antes dos testes.");
}

let cachedAdmin: TestActor | null = null;

/** Administrador ativo existente (necessário para auditoria de FKs). */
export async function adminActor(): Promise<TestActor> {
  if (cachedAdmin) return cachedAdmin;
  const companyId = await ensureTestCompany();

  const existing = await withCompany(companyId, () =>
    db.execute(
      sql`SELECT id, name FROM users WHERE role = 'ADMIN' AND is_active = true ORDER BY created_at LIMIT 1`,
    ),
  );
  const row = (existing.rows as Array<{ id: string; name: string }>)[0];
  if (row) {
    cachedAdmin = { id: row.id, name: row.name };
    return cachedAdmin;
  }

  // Primeira execução: cria o administrador da loja de testes.
  const created = await withCompany(companyId, () =>
    db.execute(sql`
      INSERT INTO users (company_id, name, email, password_hash, role, is_active)
      VALUES (${companyId}, 'Admin de Testes', 'admin@loja-de-testes.local', 'x', 'ADMIN', true)
      RETURNING id, name
    `),
  );
  const novo = (created.rows as Array<{ id: string; name: string }>)[0];
  cachedAdmin = { id: novo.id, name: novo.name };
  return cachedAdmin;
}

/** Prefixo único por execução para não colidir com dados de demonstração. */
export function stamp(prefix: string) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
}

export async function purgeTestData(markers: string[]) {
  await runAsSystem(() => purgeTestDataUnsafe(markers));
}

async function purgeTestDataUnsafe(markers: string[]) {
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

/**
 * Loja de teste: os testes de integração rodam com dados de uma loja própria,
 * criada na primeira chamada. Assim eles exercitam o mesmo isolamento que a
 * produção usa (nada roda "sem loja").
 */
let cachedCompany: string | null = null;

async function ensureTestCompany(): Promise<string> {
  if (cachedCompany) return cachedCompany;

  const existing = await runAsSystem(() =>
    db.execute(sql`SELECT id FROM companies WHERE slug = 'loja-de-testes' LIMIT 1`),
  );
  const found = (existing.rows as Array<{ id: string }>)[0];
  if (found) {
    cachedCompany = found.id;
    return cachedCompany;
  }

  const created = await runAsSystem(async () => {
    const rows = await db.execute(sql`
      INSERT INTO companies (name, slug)
      VALUES ('Loja de Testes', 'loja-de-testes')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    return (rows.rows as Array<{ id: string }>)[0].id;
  });
  await runAsSystem(() => seedCompanyDefaults(created));
  cachedCompany = created;
  return created;
}

/** Garante a loja de testes e publica o id para o isolamento das consultas. */
export async function ensureTestCompanyReady(): Promise<string> {
  const id = await ensureTestCompany();
  process.env.VITEST_TEST_COMPANY_ID = id;
  return id;
}

/** Roda um bloco dentro da loja de testes. */
export async function inTestCompany<T>(fn: () => Promise<T>): Promise<T> {
  return withCompany(await ensureTestCompany(), fn);
}

/** Leitura administrativa (sem filtro de loja) — só para preparar/limpar dados. */
export async function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return runAsSystem(fn);
}

export { db, sql };
