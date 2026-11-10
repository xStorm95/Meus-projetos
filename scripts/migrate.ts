/**
 * Executor de migrações SQL versionadas.
 * Aplica os arquivos de ./drizzle em ordem, registrando em _migrations
 * (idempotente, seguro para rodar em cada deploy) e garante os registros
 * base do sistema (configurações, depósito padrão, categorias financeiras).
 */
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const MIGRATIONS_DIR = path.resolve("drizzle");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  const pool = new Pool({ connectionString, max: 1 });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if (rows.length) continue;
    const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`[migrate] aplicando ${file} (${statements.length} comandos)`);
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err) {
        console.error(`[migrate] erro em ${file}:\n${stmt.slice(0, 400)}`);
        throw err;
      }
    }
    await pool.query("INSERT INTO _migrations(name) VALUES ($1)", [file]);
  }

  await ensureBaseline(pool);
  console.log("[migrate] banco atualizado.");
  await pool.end();
}

/**
 * Dados estruturais iniciais.
 *
 * Multi-loja: estes dados são criados POR LOJA, no cadastro (ver
 * `seedCompanyDefaults`). Num banco novo não existe loja ainda — então aqui
 * não há nada a fazer. A migração antiga (0000) já cria o necessário para
 * instalações que vieram de antes do multi-loja.
 */
async function ensureBaseline(_pool: Pool) {
  // Intencionalmente vazio: ver src/server/services/company-setup.ts
}

main().catch((err) => {
  console.error("[migrate] falhou:", err);
  process.exit(1);
});
