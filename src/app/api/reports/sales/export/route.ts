import { z } from "zod";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvDate, csvDateTime, csvNumber, jsonResponse } from "@/server/lib/export";
import { db } from "@/server/db/client";
import { customers, saleItems, salePayments, sales, users } from "@/server/db/schema";
import { addDaysKey, inicioDoDia } from "@/server/lib/dates";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  kind: z.enum(["sales", "items", "payments"]).default("sales"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().optional(),
});

export const GET = apiHandler(
  { permission: ["reports.export", "sales.view"], query: querySchema },
  async ({ query }) => {
    const from = inicioDoDia(query.from);
    const to = inicioDoDia(addDaysKey(query.to, 1));
    const conds = [gte(sales.createdAt, from), lt(sales.createdAt, to)];
    if (query.status && query.status !== "ALL") conds.push(eq(sales.status, query.status as never));
    const where = and(...conds);
    const stamp = `${query.from}_${query.to}`;

    if (query.kind === "items") {
      const rows = await db
        .select({
          number: sales.number,
          date: sales.createdAt,
          status: sales.status,
          customer: customers.name,
          description: saleItems.description,
          sku: saleItems.sku,
          color: saleItems.colorName,
          size: saleItems.sizeName,
          qty: saleItems.quantity,
          unitPrice: saleItems.unitPrice,
          discount: saleItems.discountAmount,
          total: saleItems.total,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .leftJoin(customers, eq(customers.id, sales.customerId))
        .where(where)
        .orderBy(asc(sales.number));

      if (query.format === "json") return jsonResponse(`vendas-itens_${stamp}.json`, rows);
      return csvResponse(
        `vendas-itens_${stamp}.csv`,
        ["Venda", "Data", "Status", "Cliente", "Produto", "SKU", "Cor", "Tamanho", "Qtd", "Preço unit.", "Desconto", "Total"],
        rows.map((r) => [
          r.number,
          csvDateTime(r.date),
          r.status,
          r.customer ?? "Consumidor final",
          r.description,
          r.sku,
          r.color,
          r.size,
          csvNumber(r.qty),
          csvNumber(r.unitPrice),
          csvNumber(r.discount),
          csvNumber(r.total),
        ]),
      );
    }

    if (query.kind === "payments") {
      const rows = await db
        .select({
          number: sales.number,
          date: sales.createdAt,
          method: salePayments.method,
          amount: salePayments.amount,
          installments: salePayments.installments,
          change: salePayments.changeAmount,
          status: salePayments.status,
        })
        .from(salePayments)
        .innerJoin(sales, eq(sales.id, salePayments.saleId))
        .where(where)
        .orderBy(asc(sales.number));

      if (query.format === "json") return jsonResponse(`vendas-pagamentos_${stamp}.json`, rows);
      return csvResponse(
        `vendas-pagamentos_${stamp}.csv`,
        ["Venda", "Data", "Forma", "Valor", "Parcelas", "Troco", "Situação"],
        rows.map((r) => [
          r.number,
          csvDateTime(r.date),
          r.method,
          csvNumber(r.amount),
          r.installments,
          csvNumber(r.change),
          r.status,
        ]),
      );
    }

    const rows = await db
      .select({
        number: sales.number,
        createdAt: sales.createdAt,
        completedAt: sales.completedAt,
        status: sales.status,
        customer: customers.name,
        seller: users.name,
        itemCount: sales.itemCount,
        subtotal: sales.subtotal,
        discount: sales.discountAmount,
        surcharge: sales.surchargeAmount,
        total: sales.total,
        cost: sales.costTotal,
        profit: sales.profit,
        origin: sales.originType,
        cancelReason: sales.cancelReason,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.sellerId))
      .where(where)
      .orderBy(asc(sales.number));

    if (query.format === "json") return jsonResponse(`vendas_${stamp}.json`, rows);

    return csvResponse(
      `vendas_${stamp}.csv`,
      [
        "Venda", "Data", "Concluída em", "Status", "Cliente", "Vendedor", "Itens",
        "Subtotal", "Desconto", "Acréscimo", "Total", "Custo", "Lucro", "Origem", "Motivo cancelamento",
      ],
      rows.map((r) => [
        r.number,
        csvDateTime(r.createdAt),
        csvDateTime(r.completedAt),
        r.status,
        r.customer ?? "Consumidor final",
        r.seller ?? "",
        r.itemCount,
        csvNumber(r.subtotal),
        csvNumber(r.discount),
        csvNumber(r.surcharge),
        csvNumber(r.total),
        csvNumber(r.cost),
        csvNumber(r.profit),
        r.origin,
        r.cancelReason,
      ]),
    );
  },
);
