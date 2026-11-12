/**
 * Conexão com o banco (PostgreSQL via driver pg + Drizzle ORM).
 * Funciona com qualquer PostgreSQL compatível (local, Neon, Supabase, RDS...).
 * Em desenvolvimento neste ambiente, um PostgreSQL real roda embutido via
 * PGlite no script scripts/db-server.ts e é acessado por TCP normalmente.
 *
 * MULTI-LOJA: este módulo instala um "guardião" que observa as consultas e
 * garante que nenhuma loja leia/escreva dados de outra. Ver ./tenant.ts.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";
import { TENANT_TABLES } from "./schema";
import { currentCompanyIdSync, isSystemContext, SYSTEM } from "./tenant";
import { ensureMigrations } from "./migrate-runtime";
import { env } from "../env";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __passarelaPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __passarelaDb: Database | undefined;
}

const TENANT_SET = new Set<string>(TENANT_TABLES);

/** Migrações: aplicadas uma vez por processo, no primeiro acesso ao banco. */
async function migrationsReady(): Promise<void> {
  await ensureMigrations();
}

/** Marca de "já passou pelo guardião" — evita aplicar o filtro duas vezes. */
const GUARD_MARK = "/*passarela-tenant*/";

type PgQuery = { sql: string; params: unknown[] };

function buildPool(): Pool {
  const e = env();
  return new Pool({
    connectionString: e.DATABASE_URL,
    max: e.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: false,
  });
}

export function getPool(): Pool {
  if (!global.__passarelaPool) {
    global.__passarelaPool = withTenantGuard(buildPool());
    // O pool nunca herda contexto: quem manda é a requisição (runWithCompany).
    delete (global.__passarelaPool as unknown as { __passarelaCompany?: string }).__passarelaCompany;
    global.__passarelaPool.on("error", (err) => {
      console.error("[db] erro inesperado no pool de conexões:", err.message);
    });
  }
  return global.__passarelaPool;
}

export function getDb(): Database {
  if (!global.__passarelaDb) {
    global.__passarelaDb = drizzle(getPool(), {
      schema,
      logger: process.env.DB_LOG === "1",
    });
  }
  return global.__passarelaDb;
}

/**
 * Envolve o pool do `pg` para que TODA consulta passe pelo guardião de
 * isolamento antes de chegar ao PostgreSQL.
 *
 * IMPORTANTE: o `pg` entrega a conexão em um callback assíncrono próprio, e
 * ali o AsyncLocalStorage já perdeu o contexto da requisição. Por isso o
 * guardião é aplicado em DOIS pontos:
 *   1. no pool — para transações e consultas diretas (o contexto ainda existe);
 *   2. em cada conexão obtida pelo pool — aí a loja foi capturada no momento
 *      do `connect()` e viaja junto com a conexão (ver connectWithCompany).
 */
function withTenantGuard(pool: Pool): Pool {
  const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (...args: any[]) => {
    // A Vercel não roda as migrações no deploy; o primeiro acesso do processo
    // aplica o que estiver pendente (ver ./migrate-runtime.ts).
    await migrationsReady();
    const guarded = await guardQueryArgs(args);
    return originalQuery(...(guarded ?? args));
  };

  // Conexões entregues ao Drizzle já saem "carimbadas" com a loja atual
  // e com o guardião preso na própria conexão.
  const originalConnect = pool.connect.bind(pool) as (...args: unknown[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).connect = (callback?: any) => {
    if (typeof callback === "function") {
      const companyId = currentCompanyIdSync();
      return originalConnect((err: Error | undefined, client: any, release: any) => {
        if (!err && client) stampClient(client, companyId, release);
        callback(err, client, release);
      });
    }
    const companyId = currentCompanyIdSync();
    return originalConnect().then((client: any) => stampClient(client, companyId));
  };

  return pool;
}

/**
 * Prende o guardião na conexão. A loja vem capturada do connect(); se não
 * houver (ex.: conexão ociosa reutilizada), cai no contexto atual.
 */
function stampClient(client: any, companyId: string | null, release?: any) {
  if (!client) return client;

  // Conexão já preparada: apenas atualiza a loja da vez (o pool reaproveita
  // o mesmo client em requisições diferentes).
  if (client.__passarelaStamped) {
    client.__passarelaCompany = companyId;
    return client;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patched: any = client;
  const originalQuery = patched.query.bind(patched);
  patched.__passarelaCompany = companyId;
  patched.__passarelaStamped = true;

  // Sem arrow: o `pg` decide se há callback pela aridade da função.
  patched.query = async function (this: unknown, ...args: any[]) {
    // A loja vem do carimbo da conexão ou do contexto atual. Sem loja, a
    // consulta segue como veio (o pool, um nível acima, já tentou resolver
    // pela sessão e, não achando, bloqueia a leitura).
    const company = patched.__passarelaCompany ?? currentCompanyIdSync();
    const guarded = company ? await guardQueryArgs(args, company) : null;
    return originalQuery(...(guarded ?? args));
  };

  if (release) {
    patched.release = (err?: unknown) => {
      patched.__passarelaCompany = null; // não vaza loja para o próximo uso
      return release(err);
    };
  }
  return patched;
}

/**
 * Aceita as duas formas usadas pelo driver:
 *   query(texto, valores)  |  query({ text, values })
 */
/** Marca em andamento para não empilhar resoluções de sessão. */
declare global {
  // eslint-disable-next-line no-var
  var __passarelaResolvingCompany: boolean | undefined;
}

/**
 * Último recurso para descobrir a loja: a sessão do usuário.
 *
 * Algumas leituras acontecem fora de qualquer contexto aberto (páginas que o
 * React renderiza em paralelo ao layout). Em vez de devolver vazio — o que
 * apareceria como "não encontrado" para o próprio dono —, a loja é
 * descoberta pela sessão. Se não houver sessão, aí sim nada é devolvido.
 */
async function resolveCompanyFromSession(): Promise<string | null> {
  if (global.__passarelaResolvingCompany) return null;
  global.__passarelaResolvingCompany = true;
  try {
    const { enterCompany } = await import("./tenant");
    const { getCurrentUser } = await import("../auth/session");
    const user = await getCurrentUser();
    if (!user) return null;
    enterCompany(user.companyId);
    return user.companyId;
  } catch {
    return null;
  } finally {
    global.__passarelaResolvingCompany = false;
  }
}

async function guardQueryArgs(
  args: unknown[],
  companyId?: string | null,
): Promise<unknown[] | null> {
  const resolvida = companyId ?? currentCompanyIdSync() ?? (await resolveCompanyFromSession());
  const first = args[0];

  // Formato 1: query("select ...", [valores])
  if (typeof first === "string") {
    const params = Array.isArray(args[1]) ? (args[1] as unknown[]) : [];
    const guarded = guardQuery({ sql: first, params }, companyId);
    if (!guarded) return null;
    return [guarded.sql, guarded.params, ...args.slice(2)];
  }

  // Formato 2: query({ text, values }, [valores])
  // O driver do node-postgres manda os valores no SEGUNDO argumento e deixa
  // `values` vazio no objeto — é preciso olhar os dois lugares.
  if (first && typeof first === "object" && "text" in first) {
    const config = first as { text: string; values?: unknown[] };
    const separate = Array.isArray(args[1]) ? (args[1] as unknown[]) : null;
    const params = (Array.isArray(config.values) ? config.values : null) ?? separate ?? [];

    const guarded = guardQuery({ sql: config.text, params }, resolvida);
    if (!guarded) return null;

    if (separate) {
      const patched = { ...config, text: guarded.sql };
      delete (patched as { values?: unknown[] }).values;
      return [patched, guarded.params, ...args.slice(2)];
    }
    return [{ ...config, text: guarded.sql, values: guarded.params }, ...args.slice(1)];
  }

  return null;
}

function guardQuery(query: PgQuery, companyOverride?: string | null): PgQuery | null {
  // Já passou pelo guardião (pool e conexão são dois pontos distintos):
  // nunca aplicar duas vezes, senão o filtro entra em dobro e os
  // placeholders deixam de bater.
  if (query.sql.startsWith(GUARD_MARK)) return null;

  const companyId = companyOverride ?? currentCompanyIdSync();
  if (isSystemContext()) return null; // rotina administrativa deliberada
  // Conexão carimbada por uma rotina de sistema e devolvida ao pool: nada a
  // filtrar. Sem isso, "__system__" iria como uuid e derrubaria a consulta.
  if (companyId === SYSTEM) return null;
  const text = query.sql;
  if (!/^\s*(select|with|update|delete|insert)/i.test(text)) return null;

  const referenced = referencedTenantTables(text);
  if (referenced.length === 0) return null;

  // Sem loja no contexto: falha fechada — nada é lido nem gravado.
  if (!companyId) {
    if (/^\s*insert/i.test(text)) {
      throw new Error(
        "Gravação bloqueada: nenhuma loja no contexto. Use runWithCompany().",
      );
    }
    // Sem loja: devolve conjunto vazio sem executar nada perigoso.
    return {
      sql: `${GUARD_MARK}select * from (select 1 as __sem_loja) as vazio where false`,
      params: [],
    };
  }

  if (/^\s*insert/i.test(text)) {
    return injectInsertCompany(text, query.params, companyId, referenced);
  }

  return injectFilter(text, query.params, companyId, referenced);
}

/** Quais tabelas de loja a consulta toca? */
function referencedTenantTables(text: string): string[] {
  const found = new Set<string>();
  for (const table of TENANT_TABLES) {
    // Duas formas de citar a tabela:
    //  - com aspas: "products" (o que o Drizzle gera no builder);
    //  - sem aspas, em posição de tabela: FROM suppliers, JOIN pv, UPDATE x.
    //    SQL escrito à mão (db.execute(sql`...`)) usa este formato e, sem
    //    esta checagem, escaparia do isolamento.
    const quoted = new RegExp(`"${table}"`, "i");
    const bare = new RegExp(
      `\\b(?:from|join|into|update)\\s+${table}\\b(?!\w)`,
      "i",
    );
    if (quoted.test(text) || bare.test(text)) found.add(table);
  }
  return [...found];
}

/**
 * Acrescenta o filtro de loja. Usa o primeiro alias de tabela de loja
 * encontrado; para várias tabelas de loja, filtra todas (mais seguro).
 */
function injectFilter(
  text: string,
  params: unknown[],
  companyId: string,
  tables: string[],
): PgQuery {
  const nextParams = [...params];
  let sql = text.replace(/;\s*$/, "");

  for (const t of tables) {
    const aplicado = addTenantCondition(sql, t, () => {
      nextParams.push(companyId);
      return `$${nextParams.length}`;
    });
    if (!aplicado) continue; // tabela citada de forma não reconhecida: não mexe
    // A condição do builder principal reusa um placeholder para várias
    // subconsultas; o primeiro `$n` empurrado já cobre esse caso.
    if (aplicado.conditions === 0) nextParams.push(companyId);
    sql = aplicado.sql;
  }

  return { sql: `${GUARD_MARK}${sql}`, params: nextParams };
}

/**
 * Insere `company_id` em INSERT de tabela de loja quando o código não trouxe
 * (as tabelas são NOT NULL; prefiro completar do que estourar erro no cliente).
 */
function injectInsertCompany(
  text: string,
  params: unknown[],
  companyId: string,
  tables: string[],
): PgQuery {
  const table = tables[0];
  const match = text.match(new RegExp(`insert into "?${table}"?\\s*\\(([^)]*)\\)`, "i"));
  if (!match) return { sql: text, params };
  const columns = match[1];
  // O Drizzle já inclui a coluna (mesmo com valor "default"): nesse caso
  // trocamos `default` pelo id da loja atual, sem mexer no resto.
  if (/\bcompany_id\b/i.test(columns)) {
    return substituteDefaultForCompany(text, params, columns, table, companyId);
  }

  const patchedColumns = `${columns}, "company_id"`;
  let patched = text.replace(match[0], match[0].replace(columns, patchedColumns));

  // Cada VALUES (...) do INSERT recebe um placeholder NOVO no fim da lista.
  const columnCount = columns.split(",").length;
  const nextParams = [...params];
  const afterValues = patched.match(/(values\s*)((?:\([^()]*\)\s*,?\s*)+)([\s\S]*)$/i);
  if (!afterValues || afterValues.index === undefined) return { sql: patched, params: nextParams };

  const head = patched.slice(0, afterValues.index) + afterValues[1];
  const suffix = afterValues[3];
  const tuples = afterValues[2]
    .split(/,(?=\s*\()/)
    .map((tuple) => {
      const inner = tuple.trim().replace(/^\(/, "").replace(/\)\s*,?\s*$/, "");
      const vals = splitTopLevel(inner).map((v) => v.trim());
      if (vals.length !== columnCount) return tuple.trim();
      nextParams.push(companyId);
      return `(${vals.join(", ")}, $${nextParams.length})`;
    })
    .join(", ");

  const gap = suffix && !/^\s/.test(suffix) ? " " : "";
  return { sql: `${head}${tuples}${gap}${suffix}`, params: nextParams };
}

/**
 * INSERT que já traz a coluna company_id com "default": troca esse default
 * pelo id da loja da requisição. Mantém a ordem das colunas intacta.
 */
function substituteDefaultForCompany(
  text: string,
  params: unknown[],
  columns: string,
  table: string,
  companyId: string,
): PgQuery {
  const colList = columns.split(",").map((c) => c.trim().replace(/"/g, ""));
  const companyIdx = colList.indexOf("company_id");
  if (companyIdx < 0) return { sql: text, params };

  const nextParams: unknown[] = [];
  const patched = text.replace(
    /(insert into\s+"?\w+"?\s*\([^)]*\)\s*values\s*)((?:\([^()]*\)\s*,?\s*)+)/i,
    (_full, head: string, tuples: string) => {
      const linhas = tuples
        .split(/,(?=\s*\()/)
        .map((tuple) => {
          const inner = tuple.trim().replace(/^\(/, "").replace(/\)\s*,?\s*$/, "");
          return splitTopLevel(inner).map((v) => v.trim());
        })
        .filter((vals) => vals.length === colList.length);

      if (linhas.length === 0) return `${head}${tuples}`;

      const valores = linhas
        .map((vals) => {
          const linha = vals.map((v, i) => {
            if (i === companyIdx) {
              nextParams.push(companyId);
              return `$${nextParams.length}`;
            }
            const m = v.match(/^\$(\d+)$/);
            if (m) {
              nextParams.push(params[Number(m[1]) - 1]);
              return `$${nextParams.length}`;
            }
            return v;
          });
          return `(${linha.join(", ")})`;
        })
        .join(", ");

      return `${head}${valores}`;
    },
  );
  return { sql: `${GUARD_MARK}${patched}`, params: nextParams };
}

function splitTopLevel(values: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of values) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.map((v) => v.trim());
}

/**
 * Insere `condition` no WHERE de nível superior — respeitando parênteses,
 * para não cair dentro de subconsulta. Se já existe WHERE, entra com AND,
 * antes de GROUP BY / ORDER BY / LIMIT.
 */
/**
 * Nome pelo qual a tabela é referenciada na consulta (alias quando existe).
 * O Drizzle escreve `"products"` ou `"products" "p"`; SQL escrito à mão
 * costuma usar `products` ou `products p`.
 */
function tableRef(text: string, table: string): { quoted: boolean; alias: string } | null {
  // O nome da tabela pode aparecer ANTES do FROM em dois casos comuns:
  //  1. alias de coluna igual ao nome de outra tabela —
  //     `COUNT(DISTINCT si.sale_id) AS sales ... FROM sale_items si JOIN sales s`
  //     fazia o guardião casar o `sales` do SELECT e capturar "FROM" como
  //     alias, gerando `and FROM."company_id" = $1` (erro de sintaxe 42601);
  //  2. o id da própria linha no SELECT.
  // Por isso o alias só é procurado a partir da posição em que a tabela
  // realmente é referenciada (FROM / JOIN / UPDATE / INTO).
  const refRe = new RegExp(
    `(?:\\bfrom|\\bjoin|\\bupdate|\\binto)\\s+(?:only\\s+)?(?:"${table}"|\\b${table}\\b)` +
      `(?:\\s+(?:as\\s+)?(?!where\\b|group\\b|order\\b|limit\\b|offset\\b|join\\b|left\\b|right\\b|inner\\b|full\\b|on\\b|and\\b|or\\b|set\\b|values\\b|returning\\b|union\\b|using\\b|window\\b|having\\b)([a-z_][a-z0-9_]*))?`,
    "i",
  );
  const m = text.match(refRe);
  if (!m) return null;

  const referenciadaComAspas = new RegExp(
    `(?:\\bfrom|\\bjoin|\\bupdate|\\binto)\\s+(?:only\\s+)?"${table}"`,
    "i",
  ).test(text);

  return { quoted: referenciadaComAspas, alias: m[1] ?? table };
}

/**
 * Põe a condição de loja no lugar certo para uma tabela:
 *  - tabela do FROM principal → condição no WHERE principal;
 *  - tabela em LEFT JOIN → condição no ON (senão o LEFT vira INNER e o
 *    registro principal desaparece);
 *  - tabela só citada em subconsulta → condição DENTRO do parênteses.
 * Devolve a condição efetivamente escrita (null se a tabela não aparece).
 */
function addTenantCondition(
  text: string,
  table: string,
  nextPlaceholder: () => string,
): { sql: string; conditions: number } | null {
  const ref = tableRef(text, table);
  if (!ref) return null;

  const qualifier = ref.quoted ? `"${ref.alias}"` : ref.alias;
  const montar = () => `${qualifier}."company_id" = ${nextPlaceholder()}`;

  // Em subconsulta com UNION, o filtro precisa entrar em CADA ramo: um WHERE
  // no fim aplicaria só ao último SELECT (e citaria um alias que não existe
  // ali). Cada ramo recebe o seu próprio placeholder.
  const refSolto = new RegExp(`\\b${table}\\b`, "i");
  const ramos = sinalDeMenos(text);
  if (ramos.length > 1) {
    const partes = text.split(/(\bunion(?:\s+all)?\b)/i);
    let aplicadas = 0;
    for (let i = 0; i < partes.length; i += 2) {
      const ramo = partes[i];
      if (!refSolto.test(ramo)) continue;
      if (ramo.includes(`${table}."company_id"`)) continue;
      const condition = montar();
      const inserido = inserirNoRamo(ramo, condition);
      if (!inserido) continue;
      partes[i] = inserido;
      aplicadas++;
    }
    return aplicadas ? { sql: partes.join(""), conditions: aplicadas } : null;
  }

  // A tabela aparece fora de subconsulta? Então o filtro principal resolve
  // (subconsultas correlacionadas herdam a referência da tabela externa).
  //
  // A busca é por PALAVRA INTEIRA: `COALESCE(...) AS open_payables` contém
  // "payables" dentro do nome da coluna, e o indexOf simples considerava a
  // tabela no nível principal — gerando `where p."company_id" = $x` quando `p`
  // só existia dentro da subconsulta ("missing FROM-clause entry for table p",
  // relatório "Compras por fornecedor" com 500).
  const depthAt = depths(text);
  const mostrar = ref.quoted ? `"${table}"` : `\\b${table}\\b`;
  const reOcorrencia = new RegExp(mostrar, "gi");
  let principal = false;
  for (let m = reOcorrencia.exec(text); m; m = reOcorrencia.exec(text)) {
    if (depthAt[m.index] === 0) {
      principal = true;
      break;
    }
  }

  if (principal) {
    // LEFT JOIN: filtrar a tabela opcional no WHERE a transformaria em
    // INNER JOIN e o registro principal desapareceria (produto sem marca,
    // por exemplo). Nesse caso o filtro vai na condição ON do join.
    const nomeNaTabela = ref.quoted ? `"${table}"` : `\b${table}\b`;
    const reJoin = new RegExp(
      `((?:left|right|full)\\s+(?:outer\\s+)?join\\s+${nomeNaTabela}(?:\\s+(?:as\\s+)?"?[a-z0-9_]+"?)?\\s+on\\s+)([^()]*?)(?=\\s+(?:left|right|full|inner|cross)?\\s*join\\s|\\s+where\\s|\\s+(?:group|order|limit|offset|union|returning)\\s|$)`,
      "i",
    );
    if (reJoin.test(text)) {
      let sql = text;
      for (const m of text.matchAll(new RegExp(reJoin.source, "gi"))) {
        const [inteiro, head, onExpr] = m as unknown as [string, string, string];
        const on = onExpr.trim();
        if (on.includes("company_id")) continue;
        sql = sql.replace(inteiro, `${head}${on} and ${montar()}`);
      }
      return { sql, conditions: 1 };
    }
    return { sql: appendCondition(text, montar()), conditions: 1 };
  }

  // Só em subconsulta: injeta a condição em cada parênteses que cita a
  // tabela. Feito por varredura (e não por regex) porque parênteses aninhados
  // — COALESCE((SELECT ...), 0) — fazem o regex casar o trecho errado e
  // duplicar o filtro.
  // Só as faixas MAIS INTERNAS que citam a tabela: sem isso a condição
  // entraria também no parêntese de fora do COALESCE.
  const todas = subqueryRanges(text).filter(([de, ate]) =>
    refSolto.test(text.slice(de + 1, ate)),
  );
  const alvos = todas.filter(
    ([de, ate]) => !todas.some(([d2, a2]) => d2 !== de && d2 > de && a2 < ate),
  );
  let sql = text;
  let aplicadas = 0;
  for (const [de, ate] of alvos.reverse()) {
    const inner = sql.slice(de + 1, ate);
    /*
     * Cada subconsulta pode usar um alias DIFERENTE para a mesma tabela.
     * `COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv ...))
     *  ... EXISTS (SELECT 1 FROM product_variants pv3 ...)`
     * antes recebia `pv."company_id"` nas duas — e a segunda quebrava com
     * "missing FROM-clause entry for table pv" (500 na busca de produtos).
     * O alias tem de ser lido do próprio trecho onde a condição entra.
     */
    const refInterno = tableRef(inner, table);
    const qualificadorInterno = refInterno
      ? refInterno.quoted
        ? `"${refInterno.alias}"`
        : refInterno.alias
      : qualifier;
    if (inner.includes(`${qualificadorInterno}."company_id"`)) continue;
    const condition = `${qualificadorInterno}."company_id" = ${nextPlaceholder()}`;

    /*
     * O filtro tem de entrar no WHERE — nunca depois de GROUP BY / ORDER BY /
     * HAVING / LIMIT. Antes ele era concatenado no fim do parêntese:
     *
     *   ... GROUP BY c.id
     *   and c."company_id" = $2 and s."company_id" = $3) t
     *
     * o que gera "argument of AND must be type boolean, not type uuid" e
     * derrubava o dashboard (consulta de novos/recorrentes/inativos).
     * Se o trecho tem GROUP BY, a condição vai logo após o WHERE; se não tem
     * WHERE, o primeiro GROUP BY recebe a cláusula antes dele.
     */
    const comFiltro = inserirAntesDoGroup(inner, condition);
    if (!comFiltro) continue;
    sql = `${sql.slice(0, de + 1)}${comFiltro}${sql.slice(ate)}`;
    aplicadas++;
  }
  return aplicadas ? { sql, conditions: aplicadas } : null;
}

/**
 * Põe a condição no WHERE de um trecho de subconsulta, respeitando a ordem
 * das cláusulas: o WHERE vem antes de GROUP BY / ORDER BY / HAVING / LIMIT /
 * UNION, então a condição nunca pode ser colada no fim.
 * Devolve null quando não há WHERE e a subconsulta já tem GROUP BY (sem WHERE
 * o GROUP BY não pode virar "WHERE ... GROUP BY" sem apagar o resto).
 */
function inserirAntesDoGroup(texto: string, condition: string): string | null {
  const prof = depths(texto);
  const nivel = 0;

  const acha = (re: RegExp): number => {
    const r = new RegExp(re.source, "gi");
    for (let m = r.exec(texto); m; m = r.exec(texto)) {
      if (prof[m.index] === nivel) return m.index;
    }
    return -1;
  };

  const ondeWhere = acha(/\bwhere\b/);
  const ondeGroup = acha(/\bgroup\s+by\b/);

  if (ondeWhere >= 0) {
    // Coloca a condição no fim do WHERE, antes da próxima cláusula.
    const limites = [
      acha(/\bgroup\s+by\b/),
      acha(/\border\s+by\b/),
      acha(/\bhaving\b/),
      acha(/\blimit\b/),
      acha(/\boffset\b/),
      acha(/\breturning\b/),
    ].filter((i) => i > ondeWhere);
    const fim = limites.length ? Math.min(...limites) : texto.length;
    const corpo = texto.slice(0, fim).replace(/\s+$/, "");
    return `${corpo} and ${condition} ${texto.slice(fim)}`;
  }

  if (ondeGroup === 0) return null;
  if (ondeGroup > 0) {
    // Sem WHERE: a cláusula entra imediatamente antes do GROUP BY.
    return `${texto.slice(0, ondeGroup)}where ${condition} ${texto.slice(ondeGroup)}`;
  }
  return `${texto} where ${condition}`;
}

/**
 * Insere a condição no WHERE de um ramo de UNION.
 *
 * A referência é o `FROM` do próprio ramo (e não a profundidade zero): quando
 * o UNION está dentro de um parêntese, todas as palavras estão um nível
 * abaixo. A partir do FROM do ramo, o WHERE na mesma profundidade é o do ramo,
 * e o fim é o `)`, o próximo UNION ou o GROUP BY/ORDER BY/LIMIT naquela
 * profundidade.
 */
function inserirNoRamo(ramo: string, condition: string): string | null {
  const prof = depths(ramo);

  let doFrom = -1;
  const reFrom = /\bfrom\b/gi;
  for (let m = reFrom.exec(ramo); m; m = reFrom.exec(ramo)) doFrom = m.index;
  if (doFrom < 0) return null;
  const nivel = prof[doFrom];

  let ondeWhere = -1;
  const reWhere = /\bwhere\b/gi;
  reWhere.lastIndex = doFrom;
  for (let m = reWhere.exec(ramo); m; m = reWhere.exec(ramo)) {
    if (prof[m.index] === nivel) {
      ondeWhere = m.index;
      break;
    }
  }

  const reFim = /\)|\bunion\b|\bgroup\s+by\b|\border\s+by\b|\blimit\b|\boffset\b|\breturning\b/gi;
  reFim.lastIndex = ondeWhere >= 0 ? ondeWhere : doFrom;
  let ondeFim = ramo.length;
  for (let m = reFim.exec(ramo); m; m = reFim.exec(ramo)) {
    if (prof[m.index] === nivel) {
      ondeFim = m.index;
      break;
    }
  }

  const corpo = ramo.slice(0, ondeFim).replace(/\s+$/, "");
  const resto = ramo.slice(ondeFim);
  const conector = ondeWhere >= 0 ? "and" : "where";
  return `${corpo} ${conector} ${condition} ${resto}`;
}

/** Quantos ramos UNION a consulta tem. */
function sinalDeMenos(text: string): string[] {
  return text.split(/\bunion(?:\s+all)?\b/i);
}

/** Faixas [abre, fecha] de todos os parênteses do texto (qualquer nível). */
function subqueryRanges(text: string): Array<[number, number]> {
  const faixas: Array<[number, number]> = [];
  const pilha: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") pilha.push(i);
    else if (text[i] === ")") {
      const de = pilha.pop();
      if (de !== undefined) faixas.push([de, i]);
    }
  }
  return faixas;
}

/** Profundidade de parênteses em cada posição do texto. */
function depths(text: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    out[i] = depth;
    if (text[i] === ")") depth--;
  }
  return out;
}

function appendCondition(text: string, condition: string): string {
  const depthAt: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    depthAt[i] = depth;
    if (ch === ")") depth--;
  }

  // Fim do bloco principal: primeiro GROUP BY/ORDER BY/LIMIT/FOR ... no nível 0.
  const endRe = /\s(group by|order by|limit|offset|for update|for share|returning)\s/gi;
  let endIdx = text.length;
  let m: RegExpExecArray | null;
  while ((m = endRe.exec(text))) {
    if (depthAt[m.index] === 0) {
      endIdx = m.index;
      break;
    }
  }
  const base = text.slice(0, endIdx);
  const rest = text.slice(endIdx);

  // WHERE de nível 0?
  let whereIdx = -1;
  const whereRe = /\swhere\s/gi;
  while ((m = whereRe.exec(base))) {
    if (depthAt[m.index] === 0) {
      whereIdx = m.index;
      break;
    }
  }

  if (whereIdx >= 0) {
    return `${base} and ${condition}${rest}`;
  }
  return `${base} where ${condition}${rest}`;
}

/** Descobre o alias usado para uma tabela: from "tabela" "alias". */

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, "")}"`;
}

/** Proxy para uso conveniente: db.select()... */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as Database;

export { sql };
export { schema };

/** Exposto apenas para testes do isolamento (ver tests/guard.test.ts). */
export const guardQueryForTests = guardQuery;
