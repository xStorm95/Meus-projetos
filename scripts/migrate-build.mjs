/**
 * Migração no build da Vercel.
 *
 * A Vercel não executa `scripts/start.mjs`, e o banco (Neon) é alcançável
 * durante o build — então é aqui que o esquema é aplicado, antes do site
 * subir. Se falhar, o build falha: melhor não publicar do que publicar
 * quebrado.
 */
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL ausente: pulando (build local sem banco).");
  process.exit(0);
}

const r = spawnSync("npx", ["tsx", "scripts/migrate.ts"], {
  stdio: "inherit",
  env: process.env,
});

if (r.status !== 0) {
  console.error("[migrate] FALHOU — o deploy não deve prosseguir.");
  process.exit(r.status ?? 1);
}
