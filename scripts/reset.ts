/**
 * Recria o banco do zero: DROP SCHEMA public + migrate + (opcional) seed.
 *
 *   npm run db:reset                -> só estrutura + dados base (settings,
 *                                      depósito padrão, categorias, tamanhos...)
 *   npm run db:reset -- --demo      -> estrutura + dados de demonstração
 *
 * Exige confirmação digitando SIM (use --yes para automação).
 */
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import "dotenv/config";

async function confirm(): Promise<boolean> {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question(
      "Isto APAGA TODOS os dados do banco em DATABASE_URL. Digite SIM para continuar: ",
      resolve,
    ),
  );
  rl.close();
  return answer.trim().toUpperCase() === "SIM";
}

function run(script: string, args: string[] = []) {
  const result = spawnSync("npx", ["tsx", script, ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Falha ao executar ${script}`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  if (!(await confirm())) {
    console.log("[reset] cancelado.");
    return;
  }

  const pool = new Pool({ connectionString, max: 1 });
  console.log("[reset] removendo schema public...");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.end();

  run("scripts/migrate.ts");
  if (process.argv.includes("--demo")) run("scripts/seed.ts", ["--demo"]);
  console.log("[reset] concluído.");
}

main().catch((err) => {
  console.error("[reset] falhou:", err);
  process.exit(1);
});
