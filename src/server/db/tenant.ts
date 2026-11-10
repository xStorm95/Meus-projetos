/**
 * ISOLAMENTO POR LOJA (multi-loja)
 * ---------------------------------------------------------------
 * Toda loja enxerga apenas os próprios dados. O isolamento não depende de
 * cada consulta "lembrar" de filtrar: ele é aplicado no driver do banco.
 *
 * Como funciona:
 *  1. A sessão/log de entrada descobre a loja (currentCompanyId).
 *  2. Cada requisição roda dentro de runWithCompany(companyId, fn).
 *  3. O driver (ver ./client.ts) reescreve as consultas do Drizzle,
 *     acrescentando `company_id = <loja da requisição>` em toda tabela que
 *     pertence a uma loja (ver TENANT_TABLES em ./schema.ts).
 *
 * Por que assim: são 47 tabelas e ~150 consultas. Filtrar uma por uma
 * deixaria brechas — basta esquecer uma. No driver, o esquecimento é
 * impossível, e qualquer tabela nova entra na lista automaticamente.
 *
 * Sem loja no contexto, nenhuma tabela de loja retorna nada (falha fechada).
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Store = { companyId: string | null };

/**
 * Ancorado em `globalThis`: o Next.js pode carregar este módulo em mais de um
 * bundle (rota e serviço). Se cada cópia tivesse a sua instância, o contexto
 * gravado em uma não seria visto pela outra.
 */
declare global {
  // eslint-disable-next-line no-var
  var __passarelaTenantStorage: AsyncLocalStorage<Store> | undefined;
}
const storage =
  global.__passarelaTenantStorage ?? (global.__passarelaTenantStorage = new AsyncLocalStorage<Store>());

/**
 * Loja usada pelos testes de integração. Só tem efeito fora de produção e
 * quando `VITEST_TEST_COMPANY_ID` está definida (ver tests/setup.ts) — em
 * produção nem é lida.
 */
function testCompanyFallback(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!process.env.VITEST_TEST_COMPANY_ID) return null;
  return process.env.VITEST_TEST_COMPANY_ID;
}

/** Loja da requisição atual (null quando não há, ex.: login/cadastro). */
export function currentCompanyIdSync(): string | null {
  return storage.getStore()?.companyId ?? testCompanyFallback();
}

/**
 * Loja da requisição atual; erro claro se não houver.
 *
 * Se o contexto ainda não foi aberto (acontece em página do App Router: o
 * React renderiza cada componente no seu próprio contexto assíncrono, então o
 * contexto aberto no layout não alcança a página), a loja é descoberta pela
 * sessão do usuário. É uma leitura de cookie, sem custo de rede.
 */
export async function currentCompanyId(): Promise<string> {
  const id = currentCompanyIdSync();
  if (id) return id;

  const { getCurrentUser } = await import("../auth/session");
  const user = await getCurrentUser();
  if (user) {
    enterCompany(user.companyId);
    return user.companyId;
  }

  throw new Error(
    "Contexto de loja ausente: a operação precisa de uma loja autenticada.",
  );
}

/**
 * Roda `fn` com a loja informada como contexto.
 *
 * Pegadinha que custou caro: `runWithCompany(id, () => db.select()...)` NÃO
 * funciona — a seta é avaliada antes de `storage.run` entrar em ação, então a
 * consulta é montada sem loja. Use sempre `withCompany(id, async () => ...)`.
 */
export function runWithCompany<T>(companyId: string | null, fn: () => T): T {
  const result = storage.run({ companyId }, fn);

  // Consultas do Drizzle são *thenable*, mas NÃO são `instanceof Promise`.
  const thenable = result as unknown as { then?: (a: unknown, b: unknown) => unknown };
  if (result && typeof thenable.then === "function") {
    return Promise.resolve(result).then((value) =>
      storage.run({ companyId }, () => value),
    ) as T;
  }
  return result;
}

/**
 * Entra no contexto da loja para o RESTO desta execução assíncrona.
 *
 * Usado pela resolução de sessão: quando a página faz `await getCurrentUser()`,
 * tudo o que ela executar depois (consultas de serviços, por exemplo) já roda
 * na loja correta. Faz-se necessário porque no React Server Components o
 * `layout` e a `page` são renderizados em PARALELO — o contexto aberto no
 * layout não alcança a página.
 *
 * Cada requisição tem o seu próprio contexto assíncrono, então não vaza entre
 * usuários; mesmo assim, é chamado sempre com a loja do usuário autenticado.
 */
export function enterCompany(companyId: string): void {
  storage.enterWith({ companyId });
}

/**
 * Forma segura e recomendada: o contexto já está ativo quando o corpo roda.
 * Sempre use esta em código novo.
 */
export async function withCompany<T>(companyId: string, fn: () => Promise<T> | T): Promise<T> {
  return storage.run({ companyId }, async () => fn());
}

/**
 * Executa como "sistema": usado apenas por rotinas administrativas que
 * precisam cruzar lojas de propósito (ex.: script de migração, criação de
 * usuário durante o cadastro, verificação de e-mail único global).
 * NUNCA use em rota que atende o usuário final.
 */
export function runAsSystem<T>(fn: () => T): T {
  return storage.run({ companyId: SYSTEM }, fn);
}

/** Marcador interno de "sem filtro" (uso restrito, ver acima). */
export const SYSTEM = "__system__";

/** A loja atual pode ver todas as lojas? (somente rotinas de sistema) */
export function isSystemContext(): boolean {
  return currentCompanyIdSync() === SYSTEM;
}
