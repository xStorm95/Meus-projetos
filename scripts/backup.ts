/**
 * Backup do banco em SQL puro (sem depender de pg_dump).
 *
 * Gera um arquivo .sql com estrutura (DDL lógica reconstruída a partir do
 * catálogo) + dados de todas as tabelas do schema public, na ordem correta de
 * dependências de chave estrangeira. Uso:
 *
 *   npm run backup                 -> backups/backup-YYYY-MM-DD-HHmm.sql
 *   npm run backup -- --gzip       -> backups/backup-....sql.gz
 */
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { Writable } from "node:stream";
import { Pool } from "pg";
import "dotenv/config";

type Row = Record<string, unknown>;

const BACKUP_DIR = path.resolve("backups");

function escapeLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Reconstroi a DDL de uma tabela a partir do catálogo do PostgreSQL. */
function tableDDL(row: {
  table_name: string;
  columns: string;
  constraints: string | null;
  indexes: string | null;
}) {
  const parts = [row.columns];
  if (row.constraints) parts.push(row.constraints);
  const body = parts.join(",\n  ");
  const indexes = (row.indexes ?? "")
    .split("||")
    .filter(Boolean)
    .map((i) => `${i.trim().replace(/^CREATE INDEX/i, "CREATE INDEX IF NOT EXISTS")};`)
    .join("\n");
  return `CREATE TABLE IF NOT EXISTS "${row.table_name}" (\n  ${body}\n);\n${indexes}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");

  const gzip = process.argv.includes("--gzip");
  const pool = new Pool({ connectionString, max: 1 });

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(/[: ]/g, "-")
    .slice(0, 16);
  const file = path.join(BACKUP_DIR, `backup-${stamp}.sql${gzip ? ".gz" : ""}`);

  const fileStream = createWriteStream(file);
  const out = gzip
    ? zlib.createGzip({ level: 9 }).pipe(fileStream)
    : (fileStream as unknown as Writable);

  let streamError: Error | null = null;
  out.on("error", (err: Error) => {
    streamError = err;
  });
  const write = (text: string) =>
    new Promise<void>((resolve, reject) => {
      if (streamError) return reject(streamError);
      if (!out.write(text)) out.once("drain", () => resolve());
      else resolve();
    });

  await write(
    `-- PASSARELA ERP — backup lógico\n-- gerado em ${new Date().toISOString()}\n-- restore: npm run restore -- ${path.basename(file)}\n\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\nBEGIN;\n\n`,
  );

  // 1) Enums
  const enums = await pool.query<{ enum_name: string; labels: string }>(`
    SELECT t.typname AS enum_name, string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
     GROUP BY t.typname
     ORDER BY t.typname`);
  for (const e of enums.rows) {
    await write(
      `DO $$ BEGIN\n  CREATE TYPE "${e.enum_name}" AS ENUM (${e.labels});\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;\n`,
    );
  }
  await write("\n");

  // 2) Tabelas, com colunas a partir de information_schema
  const tables = await pool.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`);

  const ddlRows = await pool.query<{
    table_name: string;
    columns: string;
    constraints: string | null;
    indexes: string | null;
  }>(`
    SELECT c.relname AS table_name,
      (SELECT string_agg(
          '  "' || a.attname || '" ' || format_type(a.atttypid, a.atttypmod)
          || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
          || CASE WHEN d.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END,
          E',\n' ORDER BY a.attnum)
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
      (SELECT string_agg('  ' || pg_get_constraintdef(con.oid), E',\n')
         FROM pg_constraint con
        WHERE con.conrelid = c.oid AND con.contype IN ('p','u','c')) AS constraints,
      (SELECT string_agg(indexdef, '||')
         FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = c.relname AND indexdef NOT LIKE '%_pkey%'
          AND indexdef NOT LIKE '% UNIQUE %') AS indexes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname`);

  for (const row of ddlRows.rows) {
    await write(tableDDL(row) + "\n");
  }

  // 3) Foreign keys depois de todas as tabelas existirem
  const fks = await pool.query<{ table_name: string; constraint_name: string; definition: string }>(`
    SELECT c.relname AS table_name, con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'f'
     ORDER BY c.relname, con.conname`);
  for (const fk of fks.rows) {
    await write(
      `DO $$ BEGIN\n  ALTER TABLE "${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}" ${fk.definition};\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;\n`,
    );
  }
  await write("\n");

  // 4) Dados — ordem topológica simples por dependência de FK
  const deps = new Map<string, Set<string>>();
  for (const t of tables.rows) deps.set(t.table_name, new Set());
  for (const fk of fks.rows) {
    const target = /REFERENCES\s+"?([a-z_]+)"?/i.exec(fk.definition)?.[1];
    if (target && target !== fk.table_name && deps.has(fk.table_name)) deps.get(fk.table_name)!.add(target);
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string, stack: Set<string>) => {
    if (visited.has(name) || stack.has(name)) return;
    stack.add(name);
    for (const dep of deps.get(name) ?? []) visit(dep, stack);
    stack.delete(name);
    visited.add(name);
    ordered.push(name);
  };
  for (const t of tables.rows) visit(t.table_name, new Set());
  for (const t of tables.rows) if (!ordered.includes(t.table_name)) ordered.push(t.table_name);

  let totalRows = 0;
  for (const table of ordered) {
    const { rows } = await pool.query<Row>(`SELECT * FROM "${table}"`);
    if (!rows.length) continue;
    totalRows += rows.length;
    const columns = Object.keys(rows[0]);
    const columnList = columns.map((c) => `"${c}"`).join(", ");
    await write(`\n-- ${table} (${rows.length} registro(s))\n`);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const values = chunk
        .map((r) => `(${columns.map((c) => escapeLiteral(r[c])).join(", ")})`)
        .join(",\n  ");
      await write(`INSERT INTO "${table}" (${columnList}) VALUES\n  ${values}\nON CONFLICT DO NOTHING;\n`);
    }
  }

  await write("\n-- fim do backup\n");
  await write("\nCOMMIT;\n");

  await new Promise<void>((resolve) => out.end(resolve));
  await new Promise<void>((resolve) => fileStream.once("close", () => resolve()));
  await pool.end();

  const stat = await fs.stat(file);
  console.log(
    `[backup] ${path.basename(file)} — ${ordered.length} tabela(s), ${totalRows} registro(s), ${(stat.size / 1024).toFixed(1)} KB`,
  );
}

main().catch((err) => {
  console.error("[backup] falhou:", err);
  process.exit(1);
});
