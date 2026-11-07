/**
 * Start de produção: aplica migrações pendentes e inicia o Next.js.
 * Exige DATABASE_URL apontando para um PostgreSQL real.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile?.(".env");
if (!process.env.DATABASE_URL) {
  console.error("[start] DATABASE_URL não definida.");
  process.exit(1);
}

const migrate = spawn("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit", env: process.env });
migrate.on("exit", (code) => {
  if (code !== 0) { console.error("[start] migrações falharam."); process.exit(1); }
  const app = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", process.env.PORT ?? "3000"], {
    stdio: "inherit", env: process.env,
  });
  app.on("exit", (c) => process.exit(c ?? 0));
});
