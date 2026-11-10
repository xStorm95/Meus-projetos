/**
 * Migrações aplicadas pelo próprio app, na primeira consulta de cada processo.
 *
 * Por que existe: a Vercel não executa `scripts/start.mjs` (o start é dela),
 * então `npm run db:migrate` não roda no deploy. Sem isto, o site subiria com
 * o banco no esquema antigo e toda consulta quebraria.
 *
 * Só o arquivo DESTE processo aplica as migrações, uma vez; as próximas
 * requisições seguem normalmente. Os arquivos são lidos do sistema de arquivos
 * do deployment (inclusive `drizzle/`), por isso ficam em `node_modules/../`
 * — ver `next.config` (outputFileTracingIncludes).
 */
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __passarelaMigrated: Promise<void> | undefined;
}

const PASTA = path.resolve(process.cwd(), "drizzle");

async function aplicar(opcoes: { obrigatorio?: boolean } = {}): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (opcoes.obrigatorio) throw new Error("DATABASE_URL não definida.");
    return;
  }
  if (!fs.existsSync(PASTA)) {
    // Sem os arquivos no deployment: o banco tem de já estar migrado.
    if (opcoes.obrigatorio) {
      throw new Error(`Pasta de migrações não encontrada: ${PASTA}`);
    }
    return;
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const arquivos = fs.readdirSync(PASTA).filter((f) => f.endsWith(".sql")).sort();
    let aplicou = 0;

    for (const arquivo of arquivos) {
      const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [arquivo]);
      if (rows.length) continue;

      const texto = fs.readFileSync(path.join(PASTA, arquivo), "utf8");
      const comandos = texto
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      console.log(`[migrate] aplicando ${arquivo} (${comandos.length} comandos)`);
      for (const comando of comandos) {
        try {
          await pool.query(comando);
        } catch (err) {
          console.error(`[migrate] erro em ${arquivo}:`, (err as Error).message);
          throw err;
        }
      }
      await pool.query("INSERT INTO _migrations(name) VALUES ($1)", [arquivo]);
      aplicou++;
    }

    if (aplicou) console.log(`[migrate] ${aplicou} arquivo(s) aplicado(s).`);
  } finally {
    await pool.end();
  }
}

/** Aplica as migrações uma única vez neste processo. */
export function ensureMigrations(): Promise<void> {
  if (!global.__passarelaMigrated) {
    global.__passarelaMigrated = aplicar().catch((err) => {
      // Não deixa o processo preso a uma falha: registra e segue (a consulta
      // seguinte vai falhar com um erro claro do banco, se for o caso).
      console.error("[migrate] falhou:", (err as Error).message);
    });
  }
  return global.__passarelaMigrated;
}

/** Aplicação em primeiro plano, com erro visível (usada no build). */
export async function migrateNow(): Promise<void> {
  await aplicar({ obrigatorio: true });
}
