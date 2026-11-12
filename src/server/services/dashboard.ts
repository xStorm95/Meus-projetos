/**
 * Indicadores do dashboard — todos calculados a partir do banco,
 * respeitando o período selecionado e comparando com o período anterior.
 */
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { customers, productVariants, products, sales } from "../db/schema";
import { addDaysKey, daysBetween, inicioDoDia, previousPeriod, rangeToTimestamps, todayKey } from "../lib/dates";
import { d, money, pct } from "../lib/money";
import { cashBalanceToday } from "./cash";
import { overdueSummary } from "./finance";

export type DashboardResult = Awaited<ReturnType<typeof getDashboard>>;

/**
 * Janela única de todo indicador do dashboard.
 *
 * ANTES existiam duas: `periodTs` (aqui) e outra montada dentro de
 * `getDashboard` com `todayKey().slice(0,7)`. Como `todayKey()` usava UTC, o
 * card do período e o card do mês podiam apontar para meses diferentes — o
 * caso do "R$ 600,00 / 1 venda" ao lado de "R$ 0,00 / 0 vendas".
 * Agora as duas usam `rangeToTimestamps` (fuso America/Sao_Paulo).
 */
function periodTs(from: string, to: string) {
  return rangeToTimestamps(from, to);
}

export async function salesSummary(from: string, to: string) {
  const ts = periodTs(from, to);
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${sales.total}), 0)::text`,
      count: sql<number>`COUNT(*)::int`,
      items: sql<number>`COALESCE(SUM(${sales.itemCount}), 0)::int`,
      profit: sql<string>`COALESCE(SUM(${sales.profit}), 0)::text`,
      cost: sql<string>`COALESCE(SUM(${sales.costTotal}), 0)::text`,
      discounts: sql<string>`COALESCE(SUM(${sales.discountAmount}), 0)::text`,
    })
    .from(sales)
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.completedAt, ts.gte), lt(sales.completedAt, ts.lt)));
  const r = rows[0];
  const count = Number(r?.count ?? 0);
  const total = money(r?.total ?? 0);
  return {
    revenue: total,
    salesCount: count,
    itemCount: Number(r?.items ?? 0),
    profit: money(r?.profit ?? 0),
    cost: money(r?.cost ?? 0),
    discounts: money(r?.discounts ?? 0),
    ticketAverage: count > 0 ? money(d(total).dividedBy(count)) : "0.00",
  };
}

export async function getDashboard(params: { from: string; to: string }) {
  const { from, to } = params;
  const today = todayKey();
  const prev = previousPeriod(from, to);
  const ts = periodTs(from, to);
  const prevTs = periodTs(prev.from, prev.to);

  const [
    current,
    previous,
    todaySummary,
    monthSummary,
    revenueSeries,
    topProducts,
    lowStock,
    expenses,
    receivableTotals,
    payableTotals,
    customerStats,
    paymentMix,
    custoAusente,
    cashBalance,
    overdue,
    topCustomers,
    sellerPerformance,
  ] = await Promise.all([
    salesSummary(from, to),
    salesSummary(prev.from, prev.to),
    salesSummary(today, today),
    // "Faturamento do mês": primeiro dia do mês corrente até hoje — mesmas
    // datas e mesmo critério (só COMPLETED) do card do período.
    salesSummary(`${today.slice(0, 7)}-01`, today),

    // O dia do gráfico é o dia da LOJA: `AT TIME ZONE` antes do date_trunc,
    // senão a venda das 22h cai no dia seguinte (UTC).
    db.execute(sql`
      SELECT to_char(day, 'DD/MM') AS label,
             to_char(day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(total), 0)::text AS receita,
             COUNT(*)::int AS vendas
        FROM (
          SELECT date_trunc('day', completed_at AT TIME ZONE 'America/Sao_Paulo') AS day, total
            FROM sales
           WHERE status = 'COMPLETED'
             AND completed_at >= ${ts.gte} AND completed_at < ${ts.lt}
        ) t
       GROUP BY day ORDER BY day
    `),

    db.execute(sql`
      SELECT p.name, p.reference, pv.sku, pv.color_name, pv.size_name,
             SUM(si.quantity)::text AS qty,
             SUM(si.total)::text AS total,
             SUM(si.total - si.unit_cost * si.quantity)::text AS lucro
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        LEFT JOIN product_variants pv ON pv.id = si.variant_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY p.name, p.reference, pv.sku, pv.color_name, pv.size_name
       ORDER BY SUM(si.quantity) DESC
       LIMIT 10
    `),

    db
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        name: products.name,
        colorName: productVariants.colorName,
        sizeName: productVariants.sizeName,
        stockQty: productVariants.stockQty,
        lowStock: products.lowStock,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.status, "ACTIVE"),
          sql`${products.deletedAt} IS NULL`,
          eq(productVariants.isActive, true),
          sql`${productVariants.stockQty}::numeric <= ${products.lowStock}::numeric`,
        ),
      )
      .orderBy(productVariants.stockQty)
      .limit(12),

    db.execute(sql`
      SELECT COALESCE(SUM(fe.amount), 0)::text AS total, COUNT(*)::int AS lancamentos
        FROM finance_entries fe
       WHERE fe.kind = 'PAYMENT'
         AND fe.paid_at >= ${ts.gte} AND fe.paid_at < ${ts.lt}
    `),

    db.execute(sql`
      SELECT COALESCE(SUM(amount - paid_amount), 0)::text AS aberto,
             COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount - paid_amount ELSE 0 END), 0)::text AS vencido,
             COUNT(*)::int AS parcelas
        FROM receivables
       WHERE status IN ('PENDING','PARTIAL','OVERDUE')
    `),

    db.execute(sql`
      SELECT COALESCE(SUM(amount - paid_amount), 0)::text AS aberto,
             COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount - paid_amount ELSE 0 END), 0)::text AS vencido,
             COUNT(*)::int AS parcelas
        FROM payables
       WHERE status IN ('PENDING','PARTIAL')
    `),

    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE first_purchase >= ${ts.gte}::timestamptz)::int AS novos,
        COUNT(*) FILTER (WHERE purchases >= 2)::int AS recorrentes,
        COUNT(*) FILTER (WHERE last_purchase < (CURRENT_DATE - INTERVAL '90 days'))::int AS inativos,
        COUNT(*) FILTER (WHERE purchases >= 2)::int * 100.0 /
          NULLIF(COUNT(*), 0) AS taxa_recompra
      FROM (
        SELECT c.id,
               COUNT(s.id)::int AS purchases,
               MIN(s.completed_at) AS first_purchase,
               MAX(s.completed_at) AS last_purchase
          FROM customers c
          LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
         WHERE c.deleted_at IS NULL
         GROUP BY c.id
      ) t
    `),

    db.execute(sql`
      SELECT method, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::int AS qtd
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY method ORDER BY SUM(amount) DESC
    `),

    /*
     * Itens vendidos no período SEM custo cadastrado.
     *
     * `sale_items.unit_cost` é NOT NULL com default 0: produto sem custo entra
     * como custo zero, o lucro vira "venda cheia" e a margem mentirosa. Em vez
     * de mostrar 0,00 como se fosse lucro real, o dashboard avisa quantos itens
     * estão nessa situação e aponta para a correção.
     */
    db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE si.unit_cost IS NULL OR si.unit_cost = 0)::int AS itens,
             COUNT(*)::int AS itens_total,
             COUNT(DISTINCT si.product_id)
               FILTER (WHERE si.unit_cost IS NULL OR si.unit_cost = 0)::int AS produtos,
             COALESCE(SUM(
               CASE WHEN si.unit_cost IS NULL OR si.unit_cost = 0
                    THEN si.quantity * si.unit_price - si.discount_amount
                    ELSE 0 END
             ), 0)::text AS receita
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
         AND si.quantity > 0
    `),

    cashBalanceToday(),
    overdueSummary(),

    db.execute(sql`
      SELECT c.name, c.id,
             COUNT(s.id)::int AS compras,
             COALESCE(SUM(s.total), 0)::text AS total
        FROM customers c
        JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
       WHERE s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY c.id, c.name
       ORDER BY SUM(s.total) DESC
       LIMIT 5
    `),

    db.execute(sql`
      SELECT u.name, u.id,
             COUNT(s.id)::int AS vendas,
             COALESCE(SUM(s.total), 0)::text AS total
        FROM sales s
        JOIN users u ON u.id = s.seller_id
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY u.id, u.name
       ORDER BY SUM(s.total) DESC
       LIMIT 5
    `),
  ]);

  /**
   * Variação percentual em relação ao período anterior.
   *
   * Devolve `null` quando não há base de comparação (período anterior zero).
   * Antes retornava 100, e a tela pintava "↗ 100,0%" em verde como se fosse
   * crescimento — número inventado. Com `null` a tela mostra "Novo" ou "—".
   */
  const variation = (curr: string, prevValue: string): number | null => {
    const c = d(curr);
    const p = d(prevValue);
    if (p.isZero()) return null;
    return Number(c.minus(p).dividedBy(p).times(100).toFixed(2));
  };

  const expenseTotal = money(
    (expenses.rows as Array<{ total: string }>)[0]?.total ?? 0,
  );
  const profitCurrent = d(current.revenue).minus(d(expenseTotal));

  const customerRow = (customerStats.rows as Array<{
    novos: number;
    recorrentes: number;
    inativos: number;
    taxa_recompra: string | null;
  }>)[0];

  return {
    period: { from, to, label: `${from} a ${to}`, days: daysBetween(from, to) + 1 },
    previousPeriod: prev,
    today: todaySummary,
    month: monthSummary,
    current,
    previous,
    variations: {
      revenue: variation(current.revenue, previous.revenue),
      salesCount: variation(String(current.salesCount), String(previous.salesCount)),
      ticketAverage: variation(current.ticketAverage, previous.ticketAverage),
      profit: variation(current.profit, previous.profit),
      itemCount: variation(String(current.itemCount), String(previous.itemCount)),
    },
    expenses: expenseTotal,
    estimatedResult: money(profitCurrent),
    /*
     * Custo ausente: o lucro exibido só é confiável se `semCusto.itens` for 0.
     * A tela usa isso para trocar o valor por "—" e mostrar o aviso.
     */
    semCusto: {
      // `itensTotal` é a base da comparação: contar linhas de venda contra
      // `current.itemCount` (peças) daria proporção errada quando há
      // quantidade > 1 na mesma linha.
      itens: Number((custoAusente.rows as Array<{ itens: number }>)[0]?.itens ?? 0),
      itensTotal: Number((custoAusente.rows as Array<{ itens_total: number }>)[0]?.itens_total ?? 0),
      produtos: Number((custoAusente.rows as Array<{ produtos: number }>)[0]?.produtos ?? 0),
      receita: money((custoAusente.rows as Array<{ receita: string }>)[0]?.receita ?? 0),
    },
    receivables: {
      open: money((receivableTotals.rows as Array<{ aberto: string }>)[0]?.aberto ?? 0),
      overdue: money((receivableTotals.rows as Array<{ vencido: string }>)[0]?.vencido ?? 0),
      installments: Number((receivableTotals.rows as Array<{ parcelas: number }>)[0]?.parcelas ?? 0),
    },
    payables: {
      open: money((payableTotals.rows as Array<{ aberto: string }>)[0]?.aberto ?? 0),
      overdue: money((payableTotals.rows as Array<{ vencido: string }>)[0]?.vencido ?? 0),
      installments: Number((payableTotals.rows as Array<{ parcelas: number }>)[0]?.parcelas ?? 0),
    },
    cashBalance,
    overdue,
    chart: (revenueSeries.rows as Array<{ label: string; day: string; receita: string; vendas: number }>).map(
      (r) => ({
        label: r.label,
        day: r.day,
        revenue: Number(r.receita),
        sales: Number(r.vendas),
      }),
    ),
    topProducts: (
      topProducts.rows as Array<{
        name: string;
        reference: string;
        sku: string | null;
        color_name: string | null;
        size_name: string | null;
        qty: string;
        total: string;
        lucro: string;
      }>
    ).map((p) => ({
      name: p.name,
      reference: p.reference,
      variant: [p.color_name, p.size_name].filter(Boolean).join(" / ") || p.sku || "—",
      quantity: Number(p.qty),
      revenue: money(p.total),
      profit: money(p.lucro),
    })),
    lowStock: lowStock.map((v) => ({
      id: v.variantId,
      sku: v.sku,
      name: v.name,
      variation: [v.colorName, v.sizeName].filter(Boolean).join(" / ") || "—",
      quantity: Number(v.stockQty),
      minimum: Number(v.lowStock),
    })),
    customers: {
      new: Number(customerRow?.novos ?? 0),
      recurring: Number(customerRow?.recorrentes ?? 0),
      inactive: Number(customerRow?.inativos ?? 0),
      repurchaseRate: Number(customerRow?.taxa_recompra ?? 0),
    },
    paymentMix: (
      paymentMix.rows as Array<{ method: string; total: string; qtd: number }>
    ).map((p) => ({ method: p.method, total: money(p.total), count: Number(p.qtd) })),
    topCustomers: (
      topCustomers.rows as Array<{ id: string; name: string; compras: number; total: string }>
    ).map((c) => ({ id: c.id, name: c.name, purchases: Number(c.compras), total: money(c.total) })),
    sellers: (
      sellerPerformance.rows as Array<{ id: string; name: string; vendas: number; total: string }>
    ).map((s) => ({ id: s.id, name: s.name, sales: Number(s.vendas), total: money(s.total) })),
    marginPercent: Number(current.revenue) > 0
      ? pct(d(current.profit), current.revenue)
      : 0,
    recurrentRevenueShare: 0,
  };
}

export type SalesEvolutionPoint = { label: string; revenue: number; sales: number };

/** Comparativo mensal dos últimos N meses. */
export async function monthlyEvolution(months = 6) {
  const rows = await db.execute(sql`
    SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month,
           to_char(date_trunc('month', completed_at), 'MM/YYYY') AS label,
           COALESCE(SUM(total), 0)::text AS receita,
           COUNT(*)::int AS vendas,
           COALESCE(SUM(profit), 0)::text AS lucro
      FROM sales
     WHERE status = 'COMPLETED'
       AND completed_at >= date_trunc('month', CURRENT_DATE) - ${sql.raw(`interval '${months - 1} months'`)}
     GROUP BY 1, 2
     ORDER BY 1
  `);
  return (rows.rows as Array<{ month: string; label: string; receita: string; vendas: number; lucro: string }>).map(
    (r) => ({
      month: r.month,
      label: r.label,
      revenue: Number(r.receita),
      sales: Number(r.vendas),
      profit: Number(r.lucro),
    }),
  );
}

export const dashboardPeriodWhere = (from: string, to: string): SQL =>
  sql`completed_at >= ${inicioDoDia(from).toISOString()}::timestamptz AND completed_at < ${inicioDoDia(addDaysKey(to, 1)).toISOString()}::timestamptz`;

/* ============================================================
 * PAINÉIS NOVOS (etapa 4)
 *  - curva ABC de produtos e de clientes (Pareto por receita);
 *  - metas por vendedor (usuário tem `monthlyGoal`) e projeção do mês;
 *  - comparativo entre lojas (visão de plataforma, dono do produto).
 *
 * Todos herdam o isolamento do driver: sem loja no contexto, nada é lido.
 * Só a comparação entre lojas usa `runWithCompany(null)` explicitamente —
 * e ela é restrita a quem administra a plataforma (ver `isPlatformAdmin`).
 * ============================================================ */

export type CurvaAbcItem = {
  /** A, B ou C */
  classe: "A" | "B" | "C";
  nome: string;
  detalhe: string;
  quantidade: number;
  receita: number;
  share: number;
  acumulado: number;
  lucro: number;
};

export type CurvaAbc = {
  itens: CurvaAbcItem[];
  /** Quantos % do faturamento vêm dos itens A (80%) — a leitura executiva. */
  classeA: { itens: number; receita: number; share: number };
  classeB: { itens: number; receita: number; share: number };
  classeC: { itens: number; receita: number; share: number };
  receitaTotal: number;
};

/**
 * Curva ABC por receita (Pareto):
 *   A = itens que somam os primeiros 80% da receita,
 *   B = até 95%,
 *   C = o restante.
 * A classificação é sempre relativa ao período — não existe curva "de sempre".
 */
export async function curvaAbcProdutos(from: string, to: string): Promise<CurvaAbc> {
  const ts = periodTs(from, to);
  const result = await db.execute(sql`
    SELECT p.name,
           COALESCE(NULLIF(CONCAT_WS(' / ', pv.color_name, pv.size_name), ''), pv.sku, p.reference) AS detalhe,
           SUM(si.quantity)::int AS quantidade,
           SUM(si.quantity * si.unit_price - si.discount_amount)::text AS receita,
           SUM(si.total - si.unit_cost * si.quantity)::text AS lucro
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN product_variants pv ON pv.id = si.variant_id
     WHERE s.status = 'COMPLETED'
       AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       AND si.quantity > 0
     GROUP BY p.name, pv.color_name, pv.size_name, pv.sku, p.reference
     ORDER BY SUM(si.quantity * si.unit_price - si.discount_amount) DESC
  `);

  return montarCurva(
    (result.rows as Array<{
      name: string;
      detalhe: string | null;
      quantidade: number;
      receita: string;
      lucro: string;
    }>).map((r) => ({
      nome: r.name,
      detalhe: r.detalhe ?? "—",
      quantidade: Number(r.quantidade),
      receita: Number(r.receita),
      lucro: Number(r.lucro),
    })),
  );
}

export async function curvaAbcClientes(from: string, to: string): Promise<CurvaAbc> {
  const ts = periodTs(from, to);
  const result = await db.execute(sql`
    SELECT c.name,
           COUNT(s.id)::int AS compras,
           COALESCE(SUM(s.total), 0)::text AS receita,
           COALESCE(SUM(s.profit), 0)::text AS lucro
      FROM sales s
      JOIN customers c ON c.id = s.customer_id
     WHERE s.status = 'COMPLETED'
       AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
     GROUP BY c.id, c.name
     ORDER BY SUM(s.total) DESC
  `);

  return montarCurva(
    (result.rows as Array<{ name: string; compras: number; receita: string; lucro: string }>).map(
      (r) => ({
        nome: r.name,
        detalhe: `${Number(r.compras)} compra(s)`,
        quantidade: Number(r.compras),
        receita: Number(r.receita),
        lucro: Number(r.lucro),
      }),
    ),
  );
}

/**
 * Regra da curva: 80% → A, 95% → B, resto → C. Receita <= 0 fica fora.
 * Exportada para teste — é a única regra de negócio do painel que não depende
 * do banco.
 */
export function montarCurva(
  brutos: Array<{ nome: string; detalhe: string; quantidade: number; receita: number; lucro: number }>,
): CurvaAbc {
  const validos = brutos.filter((b) => b.receita > 0);
  const receitaTotal = validos.reduce((acc, b) => acc + b.receita, 0);

  let acumuladoValor = 0;
  const itens: CurvaAbcItem[] = validos.map((b) => {
    /*
     * A classe olha o acumulado ANTES deste item: o item que cruza os 80%
     * ainda é A (é ele que sustenta o faturamento). Olhando o acumulado depois,
     * uma loja com um campeão isolado o classificaria como "B" e a classe A
     * ficaria vazia — leitura errada da curva.
     *
     * Comparação com tolerância: 8 itens de 10% somam 80% exatos, e o ponto
     * flutuante (0,8 acumulado) pode cair em 79,99999 ou 80,00001. O `epsilon`
     * garante que o limite pertença sempre à classe de baixo (A), independente
     * da ordem de soma.
     */
    const anterior = receitaTotal > 0 ? (acumuladoValor / receitaTotal) * 100 : 0;
    acumuladoValor += b.receita;
    const acumulado = receitaTotal > 0 ? (acumuladoValor / receitaTotal) * 100 : 0;
    const limiteA = anterior < 80 || Math.abs(anterior - 80) < 1e-9;
    const limiteB = anterior < 95 || Math.abs(anterior - 95) < 1e-9;
    return {
      classe: limiteA ? "A" : limiteB ? "B" : "C",
      nome: b.nome,
      detalhe: b.detalhe,
      quantidade: b.quantidade,
      receita: b.receita,
      share: receitaTotal > 0 ? (b.receita / receitaTotal) * 100 : 0,
      acumulado,
      lucro: b.lucro,
    };
  });

  const resumo = (classe: "A" | "B" | "C") => {
    const daClasse = itens.filter((i) => i.classe === classe);
    const receita = daClasse.reduce((acc, i) => acc + i.receita, 0);
    return {
      itens: daClasse.length,
      receita,
      share: receitaTotal > 0 ? (receita / receitaTotal) * 100 : 0,
    };
  };

  return {
    itens,
    classeA: resumo("A"),
    classeB: resumo("B"),
    classeC: resumo("C"),
    receitaTotal,
  };
}

/* ---------------- Metas ---------------- */

export type MetaVendedor = {
  id: string;
  nome: string;
  meta: number;
  realizado: number;
  /** null quando não há meta cadastrada — nunca "0%" nem "100%". */
  progresso: number | null;
  projecao: number | null;
  faltam: number | null;
};

export type MetasResumo = {
  mes: string;
  /** Dias corridos e dias úteis já passados no mês (projeção honesta). */
  hoje: { realizado: number; meta: number; progresso: number | null; projecaoMes: number | null };
  vendedores: MetaVendedor[];
  /** Quantos vendedores estão sem meta — a tela pede para cadastrar. */
  semMeta: number;
};

/**
 * Metas do mês corrente.
 *
 * `realizado` é somado por vendedor a partir das vendas concluídas; a projeção
 * usa a média diária do mês até hoje, não uma regra de três sobre o período
 * escolhido no dashboard (que pode ser de 1 dia e produzir metas irreais).
 */
export async function metasDoMes(): Promise<MetasResumo> {
  const hoje = todayKey();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const ts = periodTs(inicioMes, hoje);

  const [vendasPorVendedor, vendedores] = await Promise.all([
    db.execute(sql`
      SELECT s.seller_id AS id, COALESCE(SUM(s.total), 0)::text AS total
        FROM sales s
       WHERE s.status = 'COMPLETED'
         AND s.completed_at >= ${ts.gte} AND s.completed_at < ${ts.lt}
       GROUP BY s.seller_id
    `),
    db.execute(sql`
      SELECT id, name, COALESCE(monthly_goal, 0)::text AS meta
        FROM users
       WHERE is_active = true
       ORDER BY name
    `),
  ]);

  const realizadoPorId = new Map<string, number>();
  for (const r of vendasPorVendedor.rows as Array<{ id: string; total: string }>) {
    realizadoPorId.set(r.id, Number(r.total));
  }

  const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
  const diaAtual = Number(hoje.slice(8, 10));

  const lista: MetaVendedor[] = (vendedores.rows as Array<{ id: string; name: string; meta: string }>)
    .map((v) => {
      const meta = Number(v.meta);
      const realizado = realizadoPorId.get(v.id) ?? 0;
      const progresso = meta > 0 ? Math.round((realizado / meta) * 1000) / 10 : null;
      const projecao =
        meta > 0 && diaAtual > 0 ? Math.round((realizado / diaAtual) * diasNoMes * 100) / 100 : null;
      return {
        id: v.id,
        nome: v.name,
        meta,
        realizado,
        progresso,
        projecao,
        faltam: meta > 0 ? Math.max(0, Math.round((meta - realizado) * 100) / 100) : null,
      };
    })
    .filter((v) => v.meta > 0 || v.realizado > 0);

  const metaTotal = lista.reduce((acc, v) => acc + v.meta, 0);
  const realizadoTotal = lista.reduce((acc, v) => acc + v.realizado, 0);

  return {
    mes: hoje.slice(0, 7),
    hoje: {
      realizado: realizadoTotal,
      meta: metaTotal,
      progresso: metaTotal > 0 ? Math.round((realizadoTotal / metaTotal) * 1000) / 10 : null,
      projecaoMes:
        metaTotal > 0 && diaAtual > 0
          ? Math.round((realizadoTotal / diaAtual) * diasNoMes * 100) / 100
          : null,
    },
    vendedores: lista.sort((a, b) => b.realizado - a.realizado),
    semMeta: lista.filter((v) => v.meta === 0).length,
  };
}
