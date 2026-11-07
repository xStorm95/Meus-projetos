/**
 * Servidor PostgreSQL embutido (SOMENTE desenvolvimento/demonstração).
 *
 * Em produção use um PostgreSQL real (Neon, Supabase, RDS, Cloud SQL, etc.).
 * Aqui o PGlite roda um PostgreSQL compilado para WebAssembly e expõe o
 * protocolo de rede padrão do PostgreSQL na porta configurada — ou seja,
 * a aplicação fala SQL/Postgres real, sem dialeto próprio.
 * O estado é persistido em disco (EMBEDDED_PG_DIR).
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import path from "node:path";

const port = Number(process.env.EMBEDDED_PG_PORT ?? 5432);
const dataDir = path.resolve(process.env.EMBEDDED_PG_DIR ?? "./.pgdata");

async function main() {
  const db = await PGlite.create({ dataDir });
  const username = process.env.EMBEDDED_PG_USER ?? "postgres";
  const password = process.env.EMBEDDED_PG_PASSWORD ?? "postgres";

  // @ts-expect-error — PGlite não tipa o handler de autenticação simples
  db.on?.("error", (e: unknown) => console.error("[pg] erro:", e));

  const server = new PGLiteSocketServer({
    db,
    port,
    host: "0.0.0.0",
    maxConnections: 20,
    idleTimeout: 0,
  });
  await server.start();
  console.log(`[pg] PostgreSQL embutido ouvindo em 0.0.0.0:${port} (dataDir=${dataDir})`);
  console.log(`[pg] usuário/senha: ${username}/${password === "postgres" ? "postgres" : "***"}`);
  console.log("PG_READY");

  const shutdown = async () => {
    console.log("[pg] encerrando...");
    try {
      await server.stop();
      await db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[pg] falha ao iniciar:", err);
  process.exit(1);
});
