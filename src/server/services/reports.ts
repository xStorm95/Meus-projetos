/**
 * Serviço de relatórios gerenciais.
 * Cada relatório é uma função que recebe período/filtros e devolve dados já
 * prontos para exibição (tabela) e exportação (CSV). Nenhum cálculo de negócio
 * é duplicado: sempre que possível reutiliza os serviços especializados.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { money } from "../lib/money";
import { addDaysKey, todayKey } from "../lib/dates";

export type ReportKind =
  | "sales-summary"
  | "sales-by-product"
  | "sales-by-category"
  | "sales-by-seller"
  | "sales-by-payment"
  | "sales-by-hour"
  | "sales-by-customer"
  | "sales-canceled"
  | "stock-positions"
  | "stock-low"
  | "stock-movements"
  | "stock-valuation"
  | "customers-top"
  | "customers-inactive"
  | "customers-birthdays"
  | "customers-credit"
  | "finance-payables"
  | "finance-receivables"
  | "finance-cashflow"
  | "finance-dre"
  | "cash-sessions"
  | "credit-aging"
  | "suppliers-purchases"
  | "returns-summary"
  | "audit-log";

export type ReportColumn = { key: string; label: string; align?: "left" | "right" | "center"; format?: "money" | "number" | "date" | "text" };

export type ReportResult = {
  kind: ReportKind;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  summary: Array<{ label: string; value: string }>;
  period?: { from: string; to: string };
  generatedAt: string;
  totalRows: number;
};

export const REPORT_CATALOG: Array<{
  kind: ReportKind;
  title: string;
  description: string;
  group: "VENDAS" | "ESTOQUE" | "CLIENTES" | "FINANCEIRO" | "OPERACIONAL";
  permission: "sales.view" | "stock.view" | "customers.view" | "finance.view" | "cash.view" | "credit.view" | "suppliers.view" | "returns.view" | "audit.view";
  needsPeriod: boolean;
}> = [
  { kind: "sales-summary", title: "Vendas por dia", description: "Faturamento, ticket médio e lucro dia a dia", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-by-product", title: "Produtos mais vendidos", description: "Quantidade, faturamento e lucro por produto", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-by-category", title: "Vendas por categoria", description: "Participação de cada categoria no faturamento", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-by-seller", title: "Desempenho por vendedor", description: "Vendas, ticket médio e comissão estimada", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-by-payment", title: "Formas de pagamento", description: "Distribuição dos recebimentos por forma", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-by-hour", title: "Vendas por horário", description: "Fluxo de vendas por hora do dia", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-by-customer", title: "Vendas por cliente", description: "Clientes que mais compraram no período", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "sales-canceled", title: "Vendas canceladas", description: "Cancelamentos com motivo e responsável", group: "VENDAS", permission: "sales.view", needsPeriod: true },
  { kind: "stock-positions", title: "Posição de estoque", description: "Saldo atual por variação com valor a custo", group: "ESTOQUE", permission: "stock.view", needsPeriod: false },
  { kind: "stock-low", title: "Estoque baixo", description: "Itens no ou abaixo do mínimo para reposição", group: "ESTOQUE", permission: "stock.view", needsPeriod: false },
  { kind: "stock-movements", title: "Movimentações de estoque", description: "Entradas, saídas e ajustes com responsável", group: "ESTOQUE", permission: "stock.view", needsPeriod: true },
  { kind: "stock-valuation", title: "Valorização por categoria", description: "Capital investido e potencial de venda", group: "ESTOQUE", permission: "stock.view", needsPeriod: false },
  { kind: "customers-top", title: "Melhores clientes", description: "Ranking por volume comprado e recência", group: "CLIENTES", permission: "customers.view", needsPeriod: true },
  { kind: "customers-inactive", title: "Clientes inativos", description: "Sem compras há mais de 90 dias (reativação)", group: "CLIENTES", permission: "customers.view", needsPeriod: false },
  { kind: "customers-birthdays", title: "Aniversariantes", description: "Clientes que fazem aniversário no mês", group: "CLIENTES", permission: "customers.view", needsPeriod: false },
  { kind: "customers-credit", title: "Limites e crédito", description: "Limite, dívida aberta e crédito na loja", group: "CLIENTES", permission: "customers.view", needsPeriod: false },
  { kind: "finance-payables", title: "Contas a pagar", description: "Vencimentos, status e valores em aberto", group: "FINANCEIRO", permission: "finance.view", needsPeriod: true },
  { kind: "finance-receivables", title: "Contas a receber", description: "Parcelas, recebimentos e encargos", group: "FINANCEIRO", permission: "finance.view", needsPeriod: true },
  { kind: "finance-cashflow", title: "Fluxo de caixa", description: "Entradas, saídas e saldo do período", group: "FINANCEIRO", permission: "finance.view", needsPeriod: true },
  { kind: "finance-dre", title: "DRE resumida", description: "Receita, custos, despesas e resultado", group: "FINANCEIRO", permission: "finance.view", needsPeriod: true },
  { kind: "cash-sessions", title: "Fechamentos de caixa", description: "Abertura, esperado, contado e diferença", group: "OPERACIONAL", permission: "cash.view", needsPeriod: true },
  { kind: "credit-aging", title: "Aging do crediário", description: "Parcelas vencidas por faixa de atraso", group: "OPERACIONAL", permission: "credit.view", needsPeriod: false },
  { kind: "suppliers-purchases", title: "Compras por fornecedor", description: "Pedidos e valores por fornecedor", group: "OPERACIONAL", permission: "suppliers.view", needsPeriod: true },
  { kind: "returns-summary", title: "Trocas e devoluções", description: "Motivos, valores e créditos gerados", group: "OPERACIONAL", permission: "returns.view", needsPeriod: true },
  { kind: "audit-log", title: "Trilha de auditoria", description: "Ações registradas no período", group: "OPERACIONAL", permission: "audit.view", needsPeriod: true },
];

const moneyCol = (key: string, label: string): ReportColumn => ({ key, label, align: "right", format: "money" });
const numCol = (key: string, label: string): ReportColumn => ({ key, label, align: "right", format: "number" });
const textCol = (key: string, label: string): ReportColumn => ({ key, label, align: "left", format: "text" });
const dateCol = (key: string, label: string): ReportColumn => ({ key, label, align: "left", format: "date" });

function rowsFrom(result: { rows: unknown[] }): Array<Record<string, string | number | null>> {
  return result.rows as Array<Record<string, string | number | null>>;
}

export async function runReport(params: {
  kind: ReportKind;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ReportResult> {
  const from = params.from ?? addDaysKey(todayKey(), -29);
  const to = params.to ?? todayKey();
  const limit = Math.min(2000, params.limit ?? 500);
  const meta = REPORT_CATALOG.find((r) => r.kind === params.kind);
  if (!meta) throw new Error("Relatório desconhecido");
  const base = {
    kind: params.kind,
    title: meta.title,
    description: meta.description,
    period: { from, to },
    generatedAt: new Date().toISOString(),
  };

  switch (params.kind) {
    case "sales-summary": {
      const result = await db.execute(sql`
        SELECT TO_CHAR(completed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS sales,
               COALESCE(SUM(total), 0)::text AS revenue,
               COALESCE(AVG(total), 0)::text AS ticket,
               COALESCE(SUM(profit), 0)::text AS profit,
               COALESCE(SUM(discount_amount), 0)::text AS discounts
          FROM sales
         WHERE status = 'COMPLETED'
           AND completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY 1 ORDER BY 1 DESC
         LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      const revenue = rows.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
      const sales = rows.reduce((a, r) => a + Number(r.sales ?? 0), 0);
      return {
        ...base,
        columns: [dateCol("day", "Dia"), numCol("sales", "Vendas"), moneyCol("revenue", "Faturamento"), moneyCol("ticket", "Ticket médio"), moneyCol("profit", "Lucro"), moneyCol("discounts", "Descontos")],
        rows,
        summary: [
          { label: "Faturamento", value: money(revenue) },
          { label: "Vendas", value: String(sales) },
          { label: "Ticket médio", value: money(sales ? revenue / sales : 0) },
        ],
        totalRows: rows.length,
      };
    }
    case "sales-by-product": {
      const result = await db.execute(sql`
        SELECT si.description AS product, si.sku,
               SUM(si.quantity)::text AS qty,
               SUM(si.total)::text AS revenue,
               SUM(si.unit_cost * si.quantity)::text AS cost,
               SUM(si.total - si.unit_cost * si.quantity)::text AS profit,
               COUNT(DISTINCT si.sale_id)::int AS sales
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'COMPLETED'
           AND s.completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY si.description, si.sku
         ORDER BY SUM(si.total) DESC
         LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("product", "Produto"), textCol("sku", "SKU"), numCol("qty", "Qtd"), numCol("sales", "Vendas"), moneyCol("revenue", "Faturamento"), moneyCol("cost", "Custo"), moneyCol("profit", "Lucro")],
        rows,
        summary: [
          { label: "Itens vendidos", value: String(rows.reduce((a, r) => a + Number(r.qty ?? 0), 0)) },
          { label: "Faturamento", value: money(rows.reduce((a, r) => a + Number(r.revenue ?? 0), 0)) },
          { label: "Lucro", value: money(rows.reduce((a, r) => a + Number(r.profit ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "sales-by-category": {
      const result = await db.execute(sql`
        SELECT COALESCE(c.name, 'Sem categoria') AS category,
               SUM(si.quantity)::text AS qty,
               SUM(si.total)::text AS revenue,
               SUM(si.total - si.unit_cost * si.quantity)::text AS profit
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          LEFT JOIN products p ON p.id = si.product_id
          LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.status = 'COMPLETED'
           AND s.completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY 1 ORDER BY SUM(si.total) DESC
         LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      const totalRevenue = rows.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
      for (const row of rows) {
        row.share = totalRevenue > 0 ? `${((Number(row.revenue ?? 0) / totalRevenue) * 100).toFixed(1)}%` : "0%";
      }
      return {
        ...base,
        columns: [textCol("category", "Categoria"), numCol("qty", "Peças"), moneyCol("revenue", "Faturamento"), moneyCol("profit", "Lucro"), textCol("share", "Participação")],
        rows,
        summary: [
          { label: "Categorias", value: String(rows.length) },
          { label: "Faturamento", value: money(totalRevenue) },
        ],
        totalRows: rows.length,
      };
    }
    case "sales-by-seller": {
      const result = await db.execute(sql`
        SELECT COALESCE(u.name, 'Não identificado') AS seller, u.commission_rate::text AS commission_rate,
               COUNT(*)::int AS sales,
               COALESCE(SUM(s.total), 0)::text AS revenue,
               COALESCE(AVG(s.total), 0)::text AS ticket,
               COALESCE(SUM(s.total * COALESCE(u.commission_rate,0) / 100), 0)::text AS commission
          FROM sales s LEFT JOIN users u ON u.id = s.seller_id
         WHERE s.status = 'COMPLETED'
           AND s.completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY u.name, u.commission_rate ORDER BY SUM(s.total) DESC
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("seller", "Vendedor"), numCol("sales", "Vendas"), moneyCol("revenue", "Faturamento"), moneyCol("ticket", "Ticket médio"), textCol("commission_rate", "Comissão %"), moneyCol("commission", "Comissão")],
        rows,
        summary: [
          { label: "Vendedores ativos", value: String(rows.length) },
          { label: "Faturamento", value: money(rows.reduce((a, r) => a + Number(r.revenue ?? 0), 0)) },
          { label: "Comissões", value: money(rows.reduce((a, r) => a + Number(r.commission ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "sales-by-payment": {
      const result = await db.execute(sql`
        SELECT sp.method, COUNT(*)::int AS count,
               COALESCE(SUM(sp.amount), 0)::text AS total,
               COALESCE(AVG(sp.installments), 0)::text AS avg_installments
          FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
         WHERE s.status = 'COMPLETED' AND sp.status = 'ACTIVE'
           AND s.completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY sp.method ORDER BY SUM(sp.amount) DESC
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("method", "Forma"), numCol("count", "Lançamentos"), moneyCol("total", "Valor"), numCol("avg_installments", "Parcelas médias")],
        rows,
        summary: [{ label: "Total recebido", value: money(rows.reduce((a, r) => a + Number(r.total ?? 0), 0)) }],
        totalRows: rows.length,
      };
    }
    case "sales-by-hour": {
      const result = await db.execute(sql`
        SELECT EXTRACT(HOUR FROM completed_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
               COUNT(*)::int AS sales,
               COALESCE(SUM(total), 0)::text AS revenue
          FROM sales
         WHERE status = 'COMPLETED'
           AND completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY 1 ORDER BY 1
      `);
      const rows = rowsFrom(result).map((r) => ({ ...r, hour: `${String(r.hour).padStart(2, "0")}h` }));
      return {
        ...base,
        columns: [textCol("hour", "Horário"), numCol("sales", "Vendas"), moneyCol("revenue", "Faturamento")],
        rows,
        summary: [{ label: "Vendas", value: String(rows.length) }],
        totalRows: rows.length,
      };
    }
    case "sales-by-customer": {
      const result = await db.execute(sql`
        SELECT COALESCE(c.name, 'Consumidor final') AS customer, c.phone,
               COUNT(*)::int AS sales,
               COALESCE(SUM(s.total), 0)::text AS revenue,
               COALESCE(AVG(s.total), 0)::text AS ticket,
               MAX(s.completed_at)::text AS last_purchase
          FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.status = 'COMPLETED'
           AND s.completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY c.name, c.phone ORDER BY SUM(s.total) DESC
         LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("customer", "Cliente"), textCol("phone", "Telefone"), numCol("sales", "Compras"), moneyCol("revenue", "Total comprado"), moneyCol("ticket", "Ticket médio"), dateCol("last_purchase", "Última compra")],
        rows,
        summary: [{ label: "Clientes no período", value: String(rows.length) }],
        totalRows: rows.length,
      };
    }
    case "sales-canceled": {
      const result = await db.execute(sql`
        SELECT s.number, s.total::text, s.cancel_reason, s.canceled_at::text,
               COALESCE(c.name, 'Consumidor final') AS customer, u.name AS canceled_by,
               COALESCE(seller.name, '—') AS seller
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
          LEFT JOIN users u ON u.id = s.canceled_by
          LEFT JOIN users seller ON seller.id = s.seller_id
         WHERE s.status = 'CANCELED'
           AND s.canceled_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.canceled_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         ORDER BY s.canceled_at DESC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [numCol("number", "Venda"), moneyCol("total", "Valor"), textCol("customer", "Cliente"), textCol("seller", "Vendedor"), textCol("cancel_reason", "Motivo"), textCol("canceled_by", "Cancelado por"), dateCol("canceled_at", "Data")],
        rows,
        summary: [
          { label: "Cancelamentos", value: String(rows.length) },
          { label: "Valor cancelado", value: money(rows.reduce((a, r) => a + Number(r.total ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "stock-positions": {
      const result = await db.execute(sql`
        SELECT p.name AS product, p.reference, pv.sku, pv.color_name, pv.size_name,
               COALESCE(c.name,'—') AS category, pv.stock_qty::text, pv.cost_price::text, pv.sale_price::text,
               (pv.stock_qty * pv.cost_price)::text AS value_cost
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          LEFT JOIN categories c ON c.id = p.category_id
         WHERE pv.is_active AND p.deleted_at IS NULL
         ORDER BY p.name, pv.size_name LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("product", "Produto"), textCol("reference", "Ref."), textCol("sku", "SKU"), textCol("color_name", "Cor"), textCol("size_name", "Tam."), textCol("category", "Categoria"), numCol("stock_qty", "Saldo"), moneyCol("cost_price", "Custo"), moneyCol("sale_price", "Venda"), moneyCol("value_cost", "Valor a custo")],
        rows,
        summary: [
          { label: "Variações", value: String(rows.length) },
          { label: "Peças", value: String(rows.reduce((a, r) => a + Number(r.stock_qty ?? 0), 0)) },
          { label: "Valor a custo", value: money(rows.reduce((a, r) => a + Number(r.value_cost ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "stock-low": {
      const result = await db.execute(sql`
        SELECT p.name AS product, pv.sku, pv.color_name, pv.size_name,
               pv.stock_qty::text, COALESCE(pv.low_stock, p.low_stock, 5) AS min_stock,
               COALESCE(s.legal_name, '—') AS supplier
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE pv.is_active AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
           AND pv.stock_qty <= COALESCE(pv.low_stock, p.low_stock, 5)
         ORDER BY pv.stock_qty ASC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("product", "Produto"), textCol("sku", "SKU"), textCol("color_name", "Cor"), textCol("size_name", "Tam."), numCol("stock_qty", "Saldo"), numCol("min_stock", "Mínimo"), textCol("supplier", "Fornecedor")],
        rows,
        summary: [
          { label: "Itens críticos", value: String(rows.length) },
          { label: "Zerados", value: String(rows.filter((r) => Number(r.stock_qty) <= 0).length) },
        ],
        totalRows: rows.length,
      };
    }
    case "stock-movements": {
      const result = await db.execute(sql`
        SELECT sm.created_at::text, sm.type, p.name AS product, pv.sku,
               sm.quantity::text, sm.balance_after::text, sm.reason, sm.user_name
          FROM stock_movements sm
          JOIN products p ON p.id = sm.product_id
          JOIN product_variants pv ON pv.id = sm.variant_id
         WHERE sm.created_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND sm.created_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         ORDER BY sm.created_at DESC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [dateCol("created_at", "Data"), textCol("type", "Tipo"), textCol("product", "Produto"), textCol("sku", "SKU"), numCol("quantity", "Qtd"), numCol("balance_after", "Saldo"), textCol("reason", "Motivo"), textCol("user_name", "Usuário")],
        rows,
        summary: [
          { label: "Movimentações", value: String(rows.length) },
          { label: "Entradas", value: String(rows.filter((r) => Number(r.quantity) > 0).length) },
          { label: "Saídas", value: String(rows.filter((r) => Number(r.quantity) < 0).length) },
        ],
        totalRows: rows.length,
      };
    }
    case "stock-valuation": {
      const result = await db.execute(sql`
        SELECT COALESCE(c.name,'Sem categoria') AS category,
               COUNT(pv.id)::int AS variants,
               COALESCE(SUM(pv.stock_qty), 0)::text AS units,
               COALESCE(SUM(pv.stock_qty * pv.cost_price), 0)::text AS cost_value,
               COALESCE(SUM(pv.stock_qty * pv.sale_price), 0)::text AS sale_value,
               COALESCE(SUM(pv.stock_qty * (pv.sale_price - pv.cost_price)), 0)::text AS potential_profit
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          LEFT JOIN categories c ON c.id = p.category_id
         WHERE pv.is_active AND p.deleted_at IS NULL
         GROUP BY 1 ORDER BY SUM(pv.stock_qty * pv.cost_price) DESC
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("category", "Categoria"), numCol("variants", "Variações"), numCol("units", "Peças"), moneyCol("cost_value", "Valor a custo"), moneyCol("sale_value", "Valor a venda"), moneyCol("potential_profit", "Lucro potencial")],
        rows,
        summary: [
          { label: "Capital em estoque", value: money(rows.reduce((a, r) => a + Number(r.cost_value ?? 0), 0)) },
          { label: "Potencial de venda", value: money(rows.reduce((a, r) => a + Number(r.sale_value ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "customers-top": {
      const result = await db.execute(sql`
        SELECT c.name, c.phone, c.credit_limit::text,
               COUNT(s.id)::int AS purchases,
               COALESCE(SUM(s.total), 0)::text AS total,
               COALESCE(AVG(s.total), 0)::text AS ticket,
               MAX(s.completed_at)::text AS last_purchase
          FROM customers c JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
         WHERE s.completed_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND s.completed_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY c.id, c.name, c.phone, c.credit_limit
         ORDER BY SUM(s.total) DESC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("name", "Cliente"), textCol("phone", "Telefone"), numCol("purchases", "Compras"), moneyCol("total", "Total"), moneyCol("ticket", "Ticket médio"), dateCol("last_purchase", "Última compra")],
        rows,
        summary: [{ label: "Clientes", value: String(rows.length) }],
        totalRows: rows.length,
      };
    }
    case "customers-inactive": {
      const result = await db.execute(sql`
        SELECT c.name, c.phone, c.email, c.created_at::text,
               MAX(s.completed_at)::text AS last_purchase,
               COUNT(s.id)::int AS purchases,
               COALESCE(SUM(s.total), 0)::text AS total
          FROM customers c LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
         WHERE c.deleted_at IS NULL AND c.is_active = true
         GROUP BY c.id, c.name, c.phone, c.email, c.created_at
        HAVING MAX(s.completed_at) < now() - interval '90 days' OR (MAX(s.completed_at) IS NULL AND c.created_at < now() - interval '90 days')
         ORDER BY MAX(s.completed_at) NULLS FIRST LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("name", "Cliente"), textCol("phone", "Telefone"), textCol("email", "E-mail"), numCol("purchases", "Compras"), moneyCol("total", "Total histórico"), dateCol("last_purchase", "Última compra")],
        rows,
        summary: [{ label: "Clientes inativos", value: String(rows.length) }],
        totalRows: rows.length,
      };
    }
    case "customers-birthdays": {
      const result = await db.execute(sql`
        SELECT c.name, c.phone, c.birth_date::text,
               EXTRACT(DAY FROM c.birth_date)::int AS day,
               EXTRACT(MONTH FROM c.birth_date)::int AS month,
               COALESCE(SUM(s.total), 0)::text AS total
          FROM customers c LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
         WHERE c.deleted_at IS NULL AND c.birth_date IS NOT NULL
           AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         GROUP BY c.id, c.name, c.phone, c.birth_date
         ORDER BY EXTRACT(DAY FROM c.birth_date)
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("name", "Cliente"), textCol("phone", "Telefone"), dateCol("birth_date", "Nascimento"), numCol("day", "Dia"), moneyCol("total", "Total comprado")],
        rows,
        summary: [{ label: "Aniversariantes do mês", value: String(rows.length) }],
        totalRows: rows.length,
      };
    }
    case "customers-credit": {
      const result = await db.execute(sql`
        SELECT c.name, c.phone, c.credit_limit::text,
               COALESCE((SELECT SUM(r.amount - r.paid_amount) FROM receivables r WHERE r.customer_id = c.id AND r.status IN ('PENDING','PARTIAL','OVERDUE')), 0)::text AS debt,
               COALESCE((SELECT SUM(cc.amount - cc.used_amount) FROM customer_credits cc WHERE cc.customer_id = c.id AND cc.is_active), 0)::text AS credit,
               (c.credit_limit - COALESCE((SELECT SUM(r.amount - r.paid_amount) FROM receivables r WHERE r.customer_id = c.id AND r.status IN ('PENDING','PARTIAL','OVERDUE')), 0))::text AS available
          FROM customers c WHERE c.deleted_at IS NULL
         ORDER BY debt DESC NULLS LAST LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("name", "Cliente"), textCol("phone", "Telefone"), moneyCol("credit_limit", "Limite"), moneyCol("debt", "Dívida"), moneyCol("credit", "Crédito na loja"), moneyCol("available", "Limite disponível")],
        rows,
        summary: [
          { label: "Dívida total", value: money(rows.reduce((a, r) => a + Number(r.debt ?? 0), 0)) },
          { label: "Créditos na loja", value: money(rows.reduce((a, r) => a + Number(r.credit ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "finance-payables": {
      const result = await db.execute(sql`
        SELECT p.due_date::text, p.description, COALESCE(s.legal_name,'—') AS supplier,
               COALESCE(fc.name,'—') AS category, p.amount::text, p.paid_amount::text,
               (p.amount - p.paid_amount)::text AS balance, p.status
          FROM payables p
          LEFT JOIN suppliers s ON s.id = p.supplier_id
          LEFT JOIN finance_categories fc ON fc.id = p.category_id
         WHERE p.due_date >= ${from} AND p.due_date <= ${to}
         ORDER BY p.due_date LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [dateCol("due_date", "Vencimento"), textCol("description", "Descrição"), textCol("supplier", "Fornecedor"), textCol("category", "Categoria"), moneyCol("amount", "Valor"), moneyCol("paid_amount", "Pago"), moneyCol("balance", "Saldo"), textCol("status", "Situação")],
        rows,
        summary: [
          { label: "Contas", value: String(rows.length) },
          { label: "Total", value: money(rows.reduce((a, r) => a + Number(r.amount ?? 0), 0)) },
          { label: "Em aberto", value: money(rows.reduce((a, r) => a + Number(r.balance ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "finance-receivables": {
      const result = await db.execute(sql`
        SELECT r.due_date::text, COALESCE(c.name,'Consumidor final') AS customer, r.description,
               r.amount::text, r.paid_amount::text, (r.amount - r.paid_amount)::text AS balance, r.status
          FROM receivables r LEFT JOIN customers c ON c.id = r.customer_id
         WHERE r.due_date >= ${from} AND r.due_date <= ${to}
         ORDER BY r.due_date LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [dateCol("due_date", "Vencimento"), textCol("customer", "Cliente"), textCol("description", "Descrição"), moneyCol("amount", "Valor"), moneyCol("paid_amount", "Recebido"), moneyCol("balance", "Saldo"), textCol("status", "Situação")],
        rows,
        summary: [
          { label: "Parcelas", value: String(rows.length) },
          { label: "Em aberto", value: money(rows.reduce((a, r) => a + Number(r.balance ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "finance-cashflow": {
      const result = await db.execute(sql`
        SELECT TO_CHAR(paid_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,
               COALESCE(SUM(CASE WHEN kind = 'RECEIPT' THEN amount ELSE 0 END), 0)::text AS inflow,
               COALESCE(SUM(CASE WHEN kind = 'PAYMENT' THEN amount ELSE 0 END), 0)::text AS outflow,
               (COALESCE(SUM(CASE WHEN kind = 'RECEIPT' THEN amount ELSE 0 END),0)
                 - COALESCE(SUM(CASE WHEN kind = 'PAYMENT' THEN amount ELSE 0 END),0))::text AS net
          FROM finance_entries
         WHERE paid_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND paid_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         GROUP BY 1 ORDER BY 1 DESC
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [dateCol("day", "Dia"), moneyCol("inflow", "Entradas"), moneyCol("outflow", "Saídas"), moneyCol("net", "Saldo")],
        rows,
        summary: [
          { label: "Entradas", value: money(rows.reduce((a, r) => a + Number(r.inflow ?? 0), 0)) },
          { label: "Saídas", value: money(rows.reduce((a, r) => a + Number(r.outflow ?? 0), 0)) },
          { label: "Saldo", value: money(rows.reduce((a, r) => a + Number(r.net ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "finance-dre": {
      const { dre } = await import("./finance");
      const data = await dre({ from, to });
      const rows = [
        { line: "Receita bruta", value: data.grossRevenue },
        { line: "(-) Devoluções", value: `-${data.deductions}` },
        { line: "Receita líquida", value: data.netRevenue },
        { line: "(-) CMV", value: `-${data.cogs}` },
        { line: "Lucro bruto", value: data.grossProfit },
        { line: "(-) Despesas operacionais", value: `-${data.operatingExpenses}` },
        { line: "Resultado operacional", value: data.operatingResult },
        { line: "(+) Outras receitas", value: data.otherIncome },
        { line: "(-) Outras despesas", value: data.otherExpenses },
        { line: "Resultado líquido", value: data.finalResult },
      ];
      return {
        ...base,
        columns: [textCol("line", "Linha"), moneyCol("value", "Valor")],
        rows,
        summary: [
          { label: "Receita líquida", value: `R$ ${data.netRevenue}` },
          { label: "Resultado", value: `R$ ${data.finalResult}` },
          { label: "Margem líquida", value: `${data.netMargin.toFixed(1)}%` },
        ],
        totalRows: rows.length,
      };
    }
    case "cash-sessions": {
      const result = await db.execute(sql`
        SELECT cs.code, cs.opened_at::text, cs.closed_at::text, u.name AS user_name,
               cs.opening_amount::text, cs.expected_amount::text, cs.counted_amount::text,
               cs.difference::text, cs.status, cs.sales_total::text
          FROM cash_sessions cs LEFT JOIN users u ON u.id = cs.user_id
         WHERE cs.opened_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND cs.opened_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         ORDER BY cs.opened_at DESC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("code", "Caixa"), dateCol("opened_at", "Abertura"), dateCol("closed_at", "Fechamento"), textCol("user_name", "Operador"), moneyCol("opening_amount", "Abertura R$"), moneyCol("sales_total", "Vendas"), moneyCol("expected_amount", "Esperado"), moneyCol("counted_amount", "Contado"), moneyCol("difference", "Diferença"), textCol("status", "Situação")],
        rows,
        summary: [
          { label: "Caixas", value: String(rows.length) },
          { label: "Diferença total", value: money(rows.reduce((a, r) => a + Number(r.difference ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "credit-aging": {
      const result = await db.execute(sql`
        SELECT COALESCE(c.name,'—') AS customer, c.phone,
               COUNT(r.id)::int AS installments,
               COALESCE(SUM(r.amount - r.paid_amount), 0)::text AS total,
               CURRENT_DATE - MIN(r.due_date) AS days_late,
               CASE
                 WHEN CURRENT_DATE - MIN(r.due_date) <= 30 THEN '1. Até 30 dias'
                 WHEN CURRENT_DATE - MIN(r.due_date) <= 60 THEN '2. 31 a 60 dias'
                 WHEN CURRENT_DATE - MIN(r.due_date) <= 90 THEN '3. 61 a 90 dias'
                 ELSE '4. Acima de 90 dias'
               END AS bucket
          FROM receivables r LEFT JOIN customers c ON c.id = r.customer_id
         WHERE r.status IN ('PENDING','PARTIAL','OVERDUE') AND r.due_date < CURRENT_DATE
         GROUP BY c.name, c.phone
         ORDER BY MIN(r.due_date) ASC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      const buckets = new Map<string, number>();
      for (const row of rows) {
        const key = String(row.bucket);
        buckets.set(key, (buckets.get(key) ?? 0) + Number(row.total ?? 0));
      }
      return {
        ...base,
        columns: [textCol("customer", "Cliente"), textCol("phone", "Telefone"), numCol("installments", "Parcelas"), moneyCol("total", "Em atraso"), numCol("days_late", "Dias de atraso"), textCol("bucket", "Faixa")],
        rows,
        summary: [
          ...[...buckets.entries()].sort().map(([label, value]) => ({ label, value: money(value) })),
        ],
        totalRows: rows.length,
      };
    }
    case "suppliers-purchases": {
      const result = await db.execute(sql`
        SELECT s.legal_name AS supplier, COUNT(po.id)::int AS orders,
               COALESCE(SUM(po.total), 0)::text AS total,
               COALESCE(AVG(po.total), 0)::text AS average,
               MAX(po.issue_date)::text AS last_order,
               COALESCE((SELECT SUM(p.amount - p.paid_amount) FROM payables p WHERE p.supplier_id = s.id AND p.status IN ('PENDING','PARTIAL')), 0)::text AS open_payables
          FROM suppliers s LEFT JOIN purchase_orders po ON po.supplier_id = s.id
            AND po.issue_date >= ${from} AND po.issue_date <= ${to} AND po.status <> 'CANCELED'
         GROUP BY s.id, s.legal_name ORDER BY SUM(po.total) DESC NULLS LAST LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("supplier", "Fornecedor"), numCol("orders", "Pedidos"), moneyCol("total", "Total comprado"), moneyCol("average", "Ticket médio"), dateCol("last_order", "Último pedido"), moneyCol("open_payables", "A pagar")],
        rows,
        summary: [
          { label: "Compras no período", value: money(rows.reduce((a, r) => a + Number(r.total ?? 0), 0)) },
          { label: "A pagar (total)", value: money(rows.reduce((a, r) => a + Number(r.open_payables ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "returns-summary": {
      const result = await db.execute(sql`
        SELECT r.code, r.type, r.created_at::text, COALESCE(c.name,'Consumidor final') AS customer,
               s.number AS sale_number, r.reason, r.refund_method,
               r.returned_total::text, r.credit_generated::text, u.name AS user_name
          FROM returns r
          LEFT JOIN customers c ON c.id = r.customer_id
          LEFT JOIN sales s ON s.id = r.sale_id
          LEFT JOIN users u ON u.id = r.user_id
         WHERE r.created_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND r.created_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         ORDER BY r.created_at DESC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [textCol("code", "Documento"), textCol("type", "Tipo"), dateCol("created_at", "Data"), textCol("customer", "Cliente"), numCol("sale_number", "Venda"), textCol("reason", "Motivo"), moneyCol("returned_total", "Devolvido"), moneyCol("credit_generated", "Crédito"), textCol("user_name", "Responsável")],
        rows,
        summary: [
          { label: "Registros", value: String(rows.length) },
          { label: "Total devolvido", value: money(rows.reduce((a, r) => a + Number(r.returned_total ?? 0), 0)) },
          { label: "Créditos gerados", value: money(rows.reduce((a, r) => a + Number(r.credit_generated ?? 0), 0)) },
        ],
        totalRows: rows.length,
      };
    }
    case "audit-log": {
      const result = await db.execute(sql`
        SELECT al.created_at::text, al.user_name, al.action, al.entity, al.description, al.ip
          FROM audit_logs al
         WHERE al.created_at >= ${`${from}T00:00:00-03:00`}::timestamptz
           AND al.created_at <= ${`${to}T23:59:59-03:00`}::timestamptz
         ORDER BY al.created_at DESC LIMIT ${limit}
      `);
      const rows = rowsFrom(result);
      return {
        ...base,
        columns: [dateCol("created_at", "Data"), textCol("user_name", "Usuário"), textCol("action", "Ação"), textCol("entity", "Entidade"), textCol("description", "Descrição"), textCol("ip", "IP")],
        rows,
        summary: [{ label: "Registros", value: String(rows.length) }],
        totalRows: rows.length,
      };
    }
    default:
      throw new Error("Relatório não implementado");
  }
}

/** Resumo executivo para a home de relatórios. */
export async function reportsHome() {
  const today = todayKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM sales WHERE status = 'COMPLETED' AND completed_at >= ${`${monthStart}T00:00:00-03:00`}::timestamptz) AS sales_month,
      (SELECT COALESCE(SUM(total),0)::text FROM sales WHERE status = 'COMPLETED' AND completed_at >= ${`${monthStart}T00:00:00-03:00`}::timestamptz) AS revenue_month,
      (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NULL) AS customers,
      (SELECT COUNT(*)::int FROM product_variants WHERE is_active) AS variants,
      (SELECT COALESCE(SUM(amount - paid_amount),0)::text FROM receivables WHERE status IN ('PENDING','PARTIAL','OVERDUE')) AS receivables_open,
      (SELECT COALESCE(SUM(amount - paid_amount),0)::text FROM payables WHERE status IN ('PENDING','PARTIAL')) AS payables_open
  `);
  const r = (result.rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    salesMonth: Number(r.sales_month ?? 0),
    revenueMonth: money(String(r.revenue_month ?? 0)),
    customers: Number(r.customers ?? 0),
    variants: Number(r.variants ?? 0),
    receivablesOpen: money(String(r.receivables_open ?? 0)),
    payablesOpen: money(String(r.payables_open ?? 0)),
  };
}

export { REPORT_CATALOG as catalog };
