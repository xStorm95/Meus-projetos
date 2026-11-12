/**
 * Comparativo entre lojas — visão de PLATAFORMA.
 *
 * Uma loja nunca enxerga os números de outra: o isolamento é feito no driver
 * (`company_id` em toda tabela de loja). Para o dono do produto comparar as
 * lojas que criou, é necessário rodar FORA do contexto de loja — e só isso
 * justifica abrir mão do guardião.
 *
 * Como o acesso é autorizado (sem convite):
 *  - `PLATFORM_ADMIN_EMAILS` (variável de ambiente, lista separada por vírgula)
 *    ou o e-mail do usuário no cadastro mais antigo (`companies.created_at`),
 *    que é o dono natural da instalação;
 *  - a rota ainda exige `reports.view`.
 *
 * Nenhum dado individual de cliente/venda vaza: o comparativo só devolve
 * totais por loja (faturamento, vendas, ticket, lucro, estoque).
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { runAsSystem } from "../db/tenant";
import { addDaysKey, todayKey } from "../lib/dates";
import { money } from "../lib/money";

export type LojaComparativo = {
  id: string;
  nome: string;
  slug: string;
  status: string;
  criadaEm: string;
  faturamento: number;
  vendas: number;
  /** String decimal ("123.45") — formatar com `brl` na tela. */
  ticketMedio: string;
  lucro: number;
  produtos: number;
  estoque: number;
  /** Variação % sobre o período anterior; null sem base de comparação. */
  variacao: number | null;
};

export type ComparativoLojas = {
  periodo: { from: string; to: string };
  anterior: { from: string; to: string };
  lojas: LojaComparativo[];
  totais: { lojas: number; faturamento: number; vendas: number };
};

function emailsDaPlataforma(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A pessoa pode ver o comparativo entre lojas?
 * Precisa existir mais de uma loja — com uma só não há o que comparar.
 */
export async function podeVerComparativoLojas(user: {
  id: string;
  email: string;
}): Promise<boolean> {
  const lista = emailsDaPlataforma();
  if (lista.includes(user.email.toLowerCase())) return true;

  // `runAsSystem` é a única forma de cruzar lojas: `runWithCompany(null)`
  // significa "sem loja" e o guardião falha fechado (nenhuma linha).
  // Aqui é leitura de UM campo (e-mail do dono), sem dado de cliente/venda.
  const dono = await runAsSystem(async () => {
    const r = await db.execute(sql`
      SELECT u.email
        FROM users u
        JOIN companies c ON c.id = u.company_id
       ORDER BY c.created_at ASC
       LIMIT 1
    `);
    return (r.rows as Array<{ email: string }>)[0]?.email?.toLowerCase() ?? null;
  });

  return dono === user.email.toLowerCase();
}

/** Comparativo do período, com a variação contra o período imediatamente anterior. */
export async function comparativoLojas(from: string, to: string): Promise<ComparativoLojas> {
  const dias = Math.max(
    1,
    Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1,
  );
  const anteriorFrom = addDaysKey(from, -dias);
  const anteriorTo = addDaysKey(from, -1);

  /**
   * Soma por loja num intervalo.
   *
   * `runAsSystem` porque o comparativo cruza lojas de propósito — a rota só
   * chama isto depois de autorizar (`podeVerComparativoLojas`). `runWithCompany(null)`
   * NÃO serve: null significa "sem loja" e o guardião devolve zero linhas.
   */
  async function porLoja(inicio: string, fim: string) {
    return runAsSystem(async () => {
      const result = await db.execute(sql`
        SELECT c.id, c.name, c.slug, c.status, c.created_at,
               COALESCE(v.faturamento, 0)::text AS faturamento,
               COALESCE(v.vendas, 0)::int AS vendas,
               COALESCE(v.lucro, 0)::text AS lucro,
               COALESCE(p.produtos, 0)::int AS produtos,
               COALESCE(e.estoque, 0)::text AS estoque
          FROM companies c
          LEFT JOIN (
            SELECT company_id,
                   SUM(total) AS faturamento,
                   COUNT(*) AS vendas,
                   SUM(profit) AS lucro
              FROM sales
             WHERE status = 'COMPLETED'
               AND completed_at >= ${inicio}::date
               AND completed_at < (${fim}::date + INTERVAL '1 day')
             GROUP BY company_id
          ) v ON v.company_id = c.id
          LEFT JOIN (
            SELECT company_id, COUNT(*) AS produtos
              FROM products
             WHERE deleted_at IS NULL
             GROUP BY company_id
          ) p ON p.company_id = c.id
          LEFT JOIN (
            SELECT company_id, SUM(stock_qty * COALESCE(cost_price, 0)) AS estoque
              FROM product_variants
             WHERE is_active = true
             GROUP BY company_id
          ) e ON e.company_id = c.id
         ORDER BY COALESCE(v.faturamento, 0) DESC, c.created_at ASC
      `);
      return result.rows as Array<{
        id: string;
        name: string;
        slug: string;
        status: string;
        created_at: string;
        faturamento: string;
        vendas: number;
        lucro: string;
        produtos: number;
        estoque: string;
      }>;
    });
  }

  const [atual, anterior] = await Promise.all([porLoja(from, to), porLoja(anteriorFrom, anteriorTo)]);
  const anteriorPorId = new Map(anterior.map((l) => [l.id, Number(l.faturamento)]));

  const lojas: LojaComparativo[] = atual.map((l) => {
    const faturamento = Number(l.faturamento);
    const vendas = Number(l.vendas);
    const base = anteriorPorId.get(l.id) ?? 0;
    return {
      id: l.id,
      nome: l.name,
      slug: l.slug,
      status: l.status,
      criadaEm: new Date(l.created_at).toISOString().slice(0, 10),
      faturamento,
      vendas,
      ticketMedio: vendas > 0 ? money(faturamento / vendas) : "0.00",
      lucro: Number(l.lucro),
      produtos: Number(l.produtos),
      estoque: Number(l.estoque),
      // Sem base de comparação o número seria inventado: null → "—" na tela.
      variacao: base > 0 ? Math.round(((faturamento - base) / base) * 1000) / 10 : null,
    };
  });

  return {
    periodo: { from, to },
    anterior: { from: anteriorFrom, to: anteriorTo },
    lojas,
    totais: {
      lojas: lojas.length,
      faturamento: lojas.reduce((acc, l) => acc + l.faturamento, 0),
      vendas: lojas.reduce((acc, l) => acc + l.vendas, 0),
    },
  };
}

/** Período padrão do comparativo: últimos 30 dias (inclui hoje). */
export function periodoPadraoComparativo(): { from: string; to: string } {
  const to = todayKey();
  return { from: addDaysKey(to, -29), to };
}
