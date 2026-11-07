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

/** Dados estruturais mínimos — não são dados fictícios, são pré-requisitos. */
async function ensureBaseline(pool: Pool) {
  await pool.query(`
    INSERT INTO settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`);

  await pool.query(`
    INSERT INTO warehouses (name, is_default, is_active)
    SELECT 'Loja Principal', true, true
    WHERE NOT EXISTS (SELECT 1 FROM warehouses)`);

  const financeCategories: Array<[string, string, string]> = [
    ["Vendas de Mercadorias", "INCOME", "REVENUE"],
    ["Receitas de Serviços", "INCOME", "REVENUE"],
    ["Outras Receitas", "INCOME", "OTHER_INCOME"],
    ["Devoluções e Cancelamentos", "EXPENSE", "DEDUCTION"],
    ["Impostos sobre Vendas", "EXPENSE", "DEDUCTION"],
    ["Custo de Mercadorias Vendidas", "EXPENSE", "COGS"],
    ["Aluguel", "EXPENSE", "OPERATING_EXPENSE"],
    ["Água e Energia", "EXPENSE", "OPERATING_EXPENSE"],
    ["Internet e Telefonia", "EXPENSE", "OPERATING_EXPENSE"],
    ["Salários e Encargos", "EXPENSE", "OPERATING_EXPENSE"],
    ["Marketing e Publicidade", "EXPENSE", "OPERATING_EXPENSE"],
    ["Despesas Administrativas", "EXPENSE", "OPERATING_EXPENSE"],
    ["Despesas Bancárias e Taxas", "EXPENSE", "OPERATING_EXPENSE"],
    ["Outras Despesas", "EXPENSE", "OTHER_EXPENSE"],
  ];
  for (const [name, type, dreGroup] of financeCategories) {
    await pool.query(
      `INSERT INTO finance_categories (name, type, dre_group)
       SELECT $1, $2::finance_type, $3::dre_group
       WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE name = $1)`,
      [name, type, dreGroup],
    );
  }

  await pool.query(`
    INSERT INTO cost_centers (name)
    SELECT 'Loja Física' WHERE NOT EXISTS (SELECT 1 FROM cost_centers)`);

  await pool.query(`
    INSERT INTO bank_accounts (name, type, bank_name, current_balance, initial_balance)
    SELECT 'Caixa Loja', 'CASH', NULL, 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM bank_accounts)`);

  // Tamanhos padrão de moda feminina
  const sizes: Array<[string, number]> = [
    ["PP", 1], ["P", 2], ["M", 3], ["G", 4], ["GG", 5], ["XG", 6],
    ["34", 10], ["36", 11], ["38", 12], ["40", 13], ["42", 14], ["44", 15],
    ["46", 16], ["48", 17], ["50", 18], ["Único", 30],
  ];
  for (const [name, order] of sizes) {
    await pool.query(
      `INSERT INTO sizes (name, sort_order, type) SELECT $1, $2,
        CASE WHEN $1 = 'Único' THEN 'FREE' ELSE 'APPAREL' END
       WHERE NOT EXISTS (SELECT 1 FROM sizes WHERE name = $1)`,
      [name, order],
    );
  }

  const colors: Array<[string, string, number]> = [
    ["Preto", "#111111", 1], ["Branco", "#FFFFFF", 2], ["Off-white", "#F5F0E6", 3],
    ["Azul", "#1E40AF", 4], ["Azul Jeans", "#3B5C8A", 5], ["Bege", "#D9C9A8", 6],
    ["Rosé", "#D8A0A6", 7], ["Vermelho", "#B91C1C", 8], ["Verde", "#15803D", 9],
    ["Marrom", "#6B4423", 10], ["Cinza", "#6B7280", 11], ["Rosa", "#EC4899", 12],
    ["Nude", "#E8D3C4", 13], ["Dourado", "#C9A227", 14],
  ];
  for (const [name, hex, order] of colors) {
    await pool.query(
      `INSERT INTO colors (name, hex, sort_order) SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM colors WHERE name = $1)`,
      [name, hex, order],
    );
  }

  const categories: Array<[string, number]> = [
    ["Vestidos", 1], ["Blusas", 2], ["Camisetas", 3], ["Calças", 4], ["Shorts e Bermudas", 5],
    ["Saias", 6], ["Jaquetas e Casacos", 7], ["Macacões", 8], ["Conjuntos", 9],
    ["Acessórios", 10], ["Calçados", 11], ["Moda Íntima", 12], ["Plus Size", 13],
  ];
  for (const [name, order] of categories) {
    await pool.query(
      `INSERT INTO categories (name, sort_order)
       SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = $1 AND parent_id IS NULL)`,
      [name, order],
    );
  }
}

main().catch((err) => {
  console.error("[migrate] falhou:", err);
  process.exit(1);
});
