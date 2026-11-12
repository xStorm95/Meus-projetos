import { z } from "zod";
import { sql } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvDateTime, csvNumber, jsonResponse } from "@/server/lib/export";
import { db } from "@/server/db/client";
import { addDaysKey, inicioDoDia } from "@/server/lib/dates";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  kind: z.enum(["positions", "movements", "suggestions"]).default("positions"),
  situation: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
});

export const GET = apiHandler(
  { permission: ["reports.export", "stock.view"], query: querySchema },
  async ({ query }) => {
    const stamp = new Date().toISOString().slice(0, 10);

    if (query.kind === "movements") {
      const conds = [sql`1 = 1`];
      if (query.from) conds.push(sql`sm.created_at >= ${inicioDoDia(query.from).toISOString()}::timestamptz`);
      if (query.to) conds.push(sql`sm.created_at <= ${inicioDoDia(addDaysKey(query.to, 1)).toISOString()}::timestamptz`);
      const rows = await db.execute(sql`
        SELECT sm.created_at, sm.type, p.name AS product_name, pv.sku, pv.color_name, pv.size_name,
               sm.quantity::text, sm.balance_after::text, sm.unit_cost::text, sm.reason,
               sm.reference_type, sm.user_name, w.name AS warehouse
          FROM stock_movements sm
          JOIN products p ON p.id = sm.product_id
          JOIN product_variants pv ON pv.id = sm.variant_id
          LEFT JOIN warehouses w ON w.id = sm.warehouse_id
         WHERE ${sql.join(conds, sql` AND `)}
         ORDER BY sm.created_at DESC
         LIMIT 5000
      `);
      const list = rows.rows as Array<Record<string, string>>;
      if (query.format === "json") return jsonResponse(`movimentacoes-estoque_${stamp}.json`, list);
      return csvResponse(
        `movimentacoes-estoque_${stamp}.csv`,
        ["Data", "Tipo", "Produto", "SKU", "Cor", "Tamanho", "Quantidade", "Saldo após", "Custo un.", "Motivo", "Origem", "Usuário", "Depósito"],
        list.map((r) => [
          csvDateTime(r.created_at),
          r.type,
          r.product_name,
          r.sku,
          r.color_name,
          r.size_name,
          csvNumber(r.quantity),
          csvNumber(r.balance_after),
          csvNumber(r.unit_cost),
          r.reason,
          r.reference_type,
          r.user_name,
          r.warehouse,
        ]),
      );
    }

    const situationFilter =
      query.situation === "LOW"
        ? sql`AND pv.stock_qty > 0 AND pv.stock_qty <= COALESCE(pv.low_stock, p.low_stock, 5)`
        : query.situation === "OUT"
          ? sql`AND pv.stock_qty <= 0`
          : query.situation === "OK"
            ? sql`AND pv.stock_qty > COALESCE(pv.low_stock, p.low_stock, 5)`
            : sql``;
    const searchFilter = query.search
      ? sql`AND (lower(p.name) LIKE ${`%${query.search.toLowerCase()}%`} OR lower(pv.sku) LIKE ${`%${query.search.toLowerCase()}%`})`
      : sql``;

    const rows = await db.execute(sql`
      SELECT p.name AS product_name, p.reference, pv.sku, pv.barcode, pv.color_name, pv.size_name,
             c.name AS category, pv.stock_qty::text, pv.reserved_qty::text,
             pv.cost_price::text, pv.sale_price::text,
             (pv.stock_qty * pv.cost_price)::text AS value_cost,
             (pv.stock_qty * pv.sale_price)::text AS value_sale,
             COALESCE(pv.low_stock, p.low_stock, 5) AS low_stock
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE pv.is_active = true AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
       ${situationFilter}
       ${searchFilter}
       ORDER BY p.name, pv.size_name
    `);
    const list = rows.rows as Array<Record<string, string | number>>;
    if (query.format === "json") return jsonResponse(`estoque_${stamp}.json`, list);
    return csvResponse(
      `estoque_${stamp}.csv`,
      ["Produto", "Referência", "SKU", "Código de barras", "Cor", "Tamanho", "Categoria", "Saldo", "Reservado", "Custo", "Venda", "Valor a custo", "Valor a venda", "Mínimo"],
      list.map((r) => [
        String(r.product_name),
        String(r.reference),
        String(r.sku),
        String(r.barcode ?? ""),
        String(r.color_name ?? ""),
        String(r.size_name ?? ""),
        String(r.category ?? ""),
        csvNumber(String(r.stock_qty)),
        csvNumber(String(r.reserved_qty)),
        csvNumber(String(r.cost_price)),
        csvNumber(String(r.sale_price)),
        csvNumber(String(r.value_cost)),
        csvNumber(String(r.value_sale)),
        String(r.low_stock),
      ]),
    );
  },
);
