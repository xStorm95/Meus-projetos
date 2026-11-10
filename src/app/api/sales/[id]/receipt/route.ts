/**
 * Comprovante de venda (cupom não fiscal).
 *
 * Existe porque o botão "Comprovante" — no PDV e na lista de vendas — apontava
 * para esta rota, que não existia (404). Agora devolve HTML pronto para
 * impressão em impressora térmica de 80mm.
 */
import { eq } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { customers, saleItems, salePayments, sales, settings, users } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/uuid";
import { htmlResponse, saleReceiptHtml } from "@/server/lib/comprovante";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "sales.view" },
  async ({ params }) => {
    // id malformado (ex.: "undefined" por um link quebrado) não pode virar 500
    if (!isUuid(params.id)) throw new NotFoundError("Venda");
    const rows = await db
      .select({ sale: sales, customerName: customers.name, customerDocument: customers.document, sellerName: users.name })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.sellerId))
      .where(eq(sales.id, params.id))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Venda");

    const [items, payments, store] = await Promise.all([
      db.select().from(saleItems).where(eq(saleItems.saleId, params.id)),
      db.select().from(salePayments).where(eq(salePayments.saleId, params.id)),
      db.select().from(settings).limit(1),
    ]);

    const s = rows[0].sale;
    const cfg = store[0];

    return htmlResponse(
      saleReceiptHtml({
        storeName: cfg?.companyName ?? "Minha Loja",
        storeDocument: cfg?.companyDocument ?? null,
        storePhone: cfg?.companyPhone ?? null,
        storeAddress: [cfg?.companyAddress, cfg?.companyAddressNumber, cfg?.companyCity, cfg?.companyState]
          .filter(Boolean)
          .join(", ") || null,
        sale: {
          number: s.number,
          status: s.status,
          createdAt: s.createdAt,
          subtotal: s.subtotal,
          discountAmount: s.discountAmount,
          discountPercent: s.discountPercent,
          surchargeAmount: s.surchargeAmount,
          total: s.total,
          paidAmount: s.paidAmount,
          changeAmount: s.changeAmount,
          notes: s.notes,
          cancelReason: s.cancelReason ?? null,
        },
        customerName: rows[0].customerName,
        customerDocument: rows[0].customerDocument,
        sellerName: rows[0].sellerName,
        items: items.map((i) => ({
          description: i.description,
          sku: i.sku,
          colorName: i.colorName,
          sizeName: i.sizeName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          total: i.total,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.installments,
        })),
      }),
    );
  },
);
