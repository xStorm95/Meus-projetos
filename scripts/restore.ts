/**
 * Restauração de backup lógico (.sql ou .sql.gz) gerado por npm run backup.
 *
 *   npm run restore -- backups/backup-2026-11-07-21-40.sql.gz
 *   npm run restore -- backups/arquivo.sql --yes     (não pede confirmação)
 *
 * ATENÇÃO: a restauração NÃO apaga dados existentes. Os INSERTs usam
 * ON CONFLICT DO NOTHING, então o processo é idempotente e seguro. Para zerar
 * o banco antes, use `npm run db:reset`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { Pool } from "pg";
import "dotenv/config";

/**
 * Divide o script em comandos respeitando strings ('...'), identificadores
 * ("..."), strings com dólar ($$ ... $$ / $tag$ ... $tag$) e comentários.
 * Um split ingênuo por ";" quebra blocos DO $$ ... $$.
 */
function splitStatements(text: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let dollarTag: string | null = null;
  let inSingle = false;
  let inDouble = false;

  while (i < text.length) {
    const char = text[i];

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }

    if (inSingle) {
      current += char;
      if (char === "'" && text[i + 1] === "'") {
        current += "'";
        i += 2;
        continue;
      }
      if (char === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (inDouble) {
      current += char;
      if (char === '"') inDouble = false;
      i += 1;
      continue;
    }

    // comentário de linha
    if (char === "-" && text[i + 1] === "-") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      current += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      current += char;
      i += 1;
      continue;
    }
    if (char === "$") {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (char === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function confirm(): Promise<boolean> {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question("Restaurar este backup no banco definido em DATABASE_URL? (digite SIM) ", resolve),
  );
  rl.close();
  return answer.trim().toUpperCase() === "SIM";
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("-")) {
    throw new Error("Informe o arquivo: npm run restore -- backups/arquivo.sql[.gz]");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");

  const resolved = path.resolve(file);
  const raw = await fs.readFile(resolved);
  const sqlText = file.endsWith(".gz") ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");

  const statements = splitStatements(sqlText);

  console.log(`[restore] ${path.basename(resolved)} — ${statements.length} comando(s)`);
  if (!(await confirm())) {
    console.log("[restore] cancelado.");
    return;
  }

  const pool = new Pool({ connectionString, max: 1 });
  let ok = 0;
  let skipped = 0;
  for (const statement of statements) {
    try {
      await pool.query(statement);
      ok += 1;
    } catch (err) {
      const message = (err as Error).message;
      // Estruturas que já existem (rodando restore sobre banco migrado) não são erro.
      if (/already exists|duplicate key value|duplicate_object/i.test(message)) {
        skipped += 1;
        continue;
      }
      await pool.end();
      console.error(`[restore] falhou no comando:\n${statement.slice(0, 400)}`);
      throw err;
    }
  }
  await pool.end();
  console.log(`[restore] concluído — ${ok} comando(s) aplicado(s), ${skipped} já existente(s).`);
}

main().catch((err: unknown) => {
  const message = (err as Error)?.message;
  if (message === "cancelado") return;
  console.error("[restore] falhou:", err);
  process.exit(1);
});
