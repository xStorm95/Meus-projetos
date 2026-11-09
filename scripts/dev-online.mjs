/**
 * Sobe o site ONLINE com banco local (para testar no navegador antes do Neon).
 *
 *   node scripts/dev-online.mjs
 *
 * - usa o PostgreSQL embutido (PGlite) em ./pgdata-online — dados de verdade
 *   em disco, protocolo PostgreSQL padrão;
 * - sobe o Next.js em http://localhost:3000
 *
 * Em produção troque DATABASE_URL pelo Neon (veja docs/NEON.md).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.PORT ?? "3000";
const PG_PORT = process.env.EMBEDDED_PG_PORT ?? "5433";
const PG_DIR = process.env.EMBEDDED_PG_DIR ?? "./.pgdata-online";

if (!fs.existsSync(".env.local")) {
  const secret = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  fs.writeFileSync(
    ".env.local",
    [
      `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres"`,
      `DB_POOL_MAX="5"`,
      `AUTH_SECRET="${secret}${secret}"`,
      `SESSION_TTL_HOURS="12"`,
      `APP_URL="http://localhost:${PORT}"`,
      `NODE_ENV="development"`,
      `USE_EMBEDDED_PG="true"`,
      `DEMO_AUTO_LOGIN="false"`,
      `EMBEDDED_PG_PORT="${PG_PORT}"`,
      `EMBEDDED_PG_DIR="${PG_DIR}"`,
      `UPLOAD_DIR="./public/uploads"`,
      "",
    ].join("\n"),
  );
  console.log("[dev] .env.local criado (banco local em " + PG_DIR + ")");
}

console.log("[dev] subindo o PostgreSQL embutido na porta " + PG_PORT + "…");
const pg = spawn("npx", ["tsx", "scripts/db-server.ts"], {
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, EMBEDDED_PG_PORT: PG_PORT, EMBEDDED_PG_DIR: PG_DIR, USE_EMBEDDED_PG: "true" },
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("banco não subiu em 60s")), 60_000);
  pg.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (text.includes("PG_READY")) {
      clearTimeout(timer);
      resolve();
    }
  });
  pg.on("exit", (code) => reject(new Error("PostgreSQL embutido saiu com código " + code)));
});

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
};

console.log("[dev] aplicando migrações…");
await run("npx", ["tsx", "scripts/migrate.ts"], env);

const users = await countUsers(env);
if (users === 0) {
  console.log("[dev] nenhum usuário ainda — abra http://localhost:" + PORT + "/login e use «Criar a minha loja».");
}

console.log("[dev] subindo o site em http://localhost:" + PORT + " …");
const next = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", PORT], { stdio: "inherit", env });
next.on("exit", (code) => {
  pg.kill("SIGTERM");
  process.exit(code ?? 0);
});

function run(cmd, args, envVars) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: envVars });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(cmd + " falhou"))));
  });
}

async function countUsers(envVars) {
  const { default: pgDriver } = await import("pg");
  const pool = new pgDriver.Pool({ connectionString: envVars.DATABASE_URL, max: 1 });
  try {
    const { rows } = await pool.query("SELECT count(*)::int AS c FROM users");
    return rows[0].c;
  } catch {
    return 0;
  } finally {
    await pool.end();
  }
}
