/**
 * Orquestrador de desenvolvimento:
 *  1. valida .env
 *  2. sobe o PostgreSQL embutido (se USE_EMBEDDED_PG=true) e aguarda aceitar conexões
 *  3. aplica migrações pendentes
 *  4. inicia o Next.js
 * Em produção use `npm run start` (sem banco embutido).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

if (!existsSync(".env")) {
  console.error("Arquivo .env ausente. Copie .env.example para .env e ajuste as variáveis.");
  process.exit(1);
}
process.loadEnvFile?.(".env");

const useEmbedded = String(process.env.USE_EMBEDDED_PG ?? "false") === "true";
const pgPort = Number(process.env.EMBEDDED_PG_PORT ?? 5432);
const children = [];

function log(msg) { console.log(`\x1b[36m[dev]\x1b[0m ${msg}`); }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`))));
    child.on("error", reject);
  });
}

function waitForPort(port, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`Porta ${port} não abriu a tempo`));
        else setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

async function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

async function main() {
  if (useEmbedded) {
    const already = await portInUse(pgPort);
    if (already) {
      log(`PostgreSQL já está ativo na porta ${pgPort} — reutilizando.`);
    } else {
      log("Iniciando PostgreSQL embutido (PGlite)...");
      const pg = spawn("npx", ["tsx", "scripts/db-server.ts"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
      children.push(pg);
      pg.stdout.on("data", (d) => {
        const s = d.toString();
        if (s.includes("PG_READY") || s.startsWith("[pg]")) process.stdout.write(s);
      });
      pg.stderr.on("data", (d) => process.stderr.write(`\x1b[31m[pg]\x1b[0m ${d}`));
      await waitForPort(pgPort);
      log(`PostgreSQL pronto na porta ${pgPort}.`);
    }
    log("Aplicando migrações...");
    await run("npx", ["tsx", "scripts/migrate.ts"]);
  } else {
    log("Usando DATABASE_URL externo.");
    log("Aplicando migrações...");
    await run("npx", ["tsx", "scripts/migrate.ts"]);
  }

  log("Iniciando Next.js em http://0.0.0.0:3000");
  const next = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", "3000"], {
    stdio: "inherit",
    env: process.env,
  });
  children.push(next);

  const shutdown = (signal) => {
    log(`Recebido ${signal}, encerrando...`);
    for (const c of children) { try { c.kill("SIGTERM"); } catch {} }
    setTimeout(() => process.exit(0), 1500);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  next.on("exit", (code) => {
    for (const c of children) { try { c.kill("SIGTERM"); } catch {} }
    process.exit(code ?? 0);
  });
}

main().catch((err) => { console.error("[dev] erro:", err.message); process.exit(1); });
