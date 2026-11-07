import { z } from "zod";
import { sql } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvNumber, jsonResponse } from "@/server/lib/export";
import { db } from "@/server/db/client";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const GET = apiHandler(
  { permission: ["products.import", "products.view"], query: querySchema },
  async ({ query }) => {
    const conds = [sql`p.deleted_at IS NULL`];
    if (query.search) {
      const term = `%${query.search.toLowerCase()}%`;
      conds.push(sql`(lower(p.name) LIKE ${term} OR lower(p.reference) LIKE ${term} OR lower(pv.sku) LIKE ${term})`);
    }
    if (query.categoryId) conds.push(sql`p.category_id = ${query.categoryId}`);
    if (query.status === "ACTIVE" || query.status === "INACTIVE") conds.push(sql`p.status = ${query.status}`);

    const rows = await db.execute(sql`
      SELECT p.name, p.reference, p.barcode, p.status, p.unit,
             c.name AS category, b.name AS brand, s.legal_name AS supplier, col.name AS collection,
             p.material, p.composition, p.ncm,
             p.cost_price::text, p.sale_price::text, p.low_stock,
             pv.sku, pv.color_name, pv.size_name, pv.barcode AS variant_barcode,
             pv.stock_qty::text, pv.cost_price::text AS variant_cost, pv.sale_price::text AS variant_price
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN collections col ON col.id = p.collection_id
        LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
       WHERE ${sql.join(conds, sql` AND `)}
       ORDER BY p.name, pv.size_name
    `);

    const list = rows.rows as Array<Record<string, string | number>>;
    const stamp = new Date().toISOString().slice(0, 10);

    if (query.format === "json") return jsonResponse(`produtos_${stamp}.json`, list);

    return csvResponse(
      `produtos_${stamp}.csv`,
      [
        "nome", "referencia", "categoria", "marca", "fornecedor", "colecao", "material", "composicao", "ncm",
        "cor", "tamanho", "codigo_barras", "custo", "preco", "estoque", "sku", "situacao",
      ],
      list.map((r) => [
        String(r.name),
        String(r.reference),
        String(r.category ?? ""),
        String(r.brand ?? ""),
        String(r.supplier ?? ""),
        String(r.collection ?? ""),
        String(r.material ?? ""),
        String(r.composition ?? ""),
        String(r.ncm ?? ""),
        String(r.color_name ?? ""),
        String(r.size_name ?? ""),
        String(r.variant_barcode ?? r.barcode ?? ""),
        csvNumber(String(r.variant_cost ?? r.cost_price ?? 0)),
        csvNumber(String(r.variant_price ?? r.sale_price ?? 0)),
        csvNumber(String(r.stock_qty ?? 0)),
        String(r.sku ?? ""),
        String(r.status),
      ]),
    );
  },
);
