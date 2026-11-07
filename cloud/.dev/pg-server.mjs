/** Servidor Postgres de desenvolvimento (PGlite + socket TCP). Apenas para testes locais. */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PGPORT ?? 55432);
const dir = process.env.PGDIR ?? "memory://";
const db = new PGlite(dir);
await db.waitReady;
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 5 });
await server.start();
console.log(`[pglite] escutando em 127.0.0.1:${port} (db=${dir})`);
process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});
