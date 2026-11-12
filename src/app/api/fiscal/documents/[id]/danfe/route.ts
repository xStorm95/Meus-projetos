/**
 * Cupom/DANFE simplificada de um documento fiscal (NFC-e modelo 65 / NF-e 55).
 *
 * Devolve HTML de 80 mm pronto para impressão — o botão "Imprimir cupom" abre
 * esta rota em nova aba. Quando o documento está PENDING (sem transmissão), o
 * cupom sai com a tarja "SEM VALOR FISCAL — PENDENTE DE AUTORIZAÇÃO": o sistema
 * não inventa autorização.
 */
import { eq } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { db } from "@/server/db/client";
import {
  customers,
  fiscalDocuments,
  products,
  saleItems,
  salePayments,
  sales,
  settings,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/uuid";
import { htmlResponse } from "@/server/lib/comprovante";
import { danfeHtml } from "@/server/lib/danfe";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: ["fiscal.view", "sales.view"] },
  async ({ params }) => {
    if (!isUuid(params.id)) throw new NotFoundError("Documento fiscal");

    const rows = await db
      .select({
        doc: fiscalDocuments,
        saleNumber: sales.number,
        saleTotal: sales.total,
        customerName: customers.name,
        customerDocument: customers.document,
      })
      .from(fiscalDocuments)
      .leftJoin(sales, eq(sales.id, fiscalDocuments.saleId))
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(eq(fiscalDocuments.id, params.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Documento fiscal");

    const [itens, pagamentos, cfg] = await Promise.all([
      row.doc.saleId
        ? db
            .select({
              sku: saleItems.sku,
              description: saleItems.description,
              colorName: saleItems.colorName,
              sizeName: saleItems.sizeName,
              quantity: saleItems.quantity,
              unitPrice: saleItems.unitPrice,
              total: saleItems.total,
              // NCM/CFOP vêm do produto; a venda congela o que foi praticado.
              ncm: products.ncm,
            })
            .from(saleItems)
            .leftJoin(products, eq(products.id, saleItems.productId))
            .where(eq(saleItems.saleId, row.doc.saleId))
        : Promise.resolve([]),
      row.doc.saleId
        ? db.select().from(salePayments).where(eq(salePayments.saleId, row.doc.saleId))
        : Promise.resolve([]),
      db.select().from(settings).limit(1),
    ]);

    const store = cfg[0];
    const total = row.saleTotal ?? row.doc.total;

    /**
     * Tributos aproximados: o padrão da loja (quando configurado) sobre o total.
     * Não é cálculo fiscal — é a informação de transparência da Lei 12.741.
     * Sem configuração, o campo fica null e a linha não aparece no cupom.
     */
    const aliquota = Number(process.env.DANFE_TAX_PERCENT ?? 0);
    const tributos = aliquota > 0 ? (Number(total) * (aliquota / 100)).toFixed(2) : null;

    return htmlResponse(
      danfeHtml({
        emitente: {
          nome: store?.companyName ?? "Minha Loja",
          razaoSocial: store?.companyLegalName ?? null,
          documento: store?.companyDocument ?? null,
          inscricaoEstadual: store?.companyStateRegistration ?? null,
          endereco: [store?.companyAddress, store?.companyAddressNumber, store?.companyDistrict]
            .filter(Boolean)
            .join(", ") || null,
          cidade: store?.companyCity ?? null,
          uf: store?.companyState ?? null,
          telefone: store?.companyPhone ?? null,
        },
        documento: {
          modelo: row.doc.model === "55" ? "55" : "65",
          serie: row.doc.series,
          numero: row.doc.number,
          ambiente: row.doc.environment,
          status: row.doc.status,
          chaveAcesso: row.doc.accessKey,
          protocolo: row.doc.protocol,
          emitidoEm: row.doc.issuedAt ?? row.doc.createdAt,
          rejeicao: row.doc.rejectionMessage,
        },
        venda: { numero: row.saleNumber ?? 0, total },
        consumidor: {
          nome: row.customerName,
          documento: row.customerDocument,
        },
        itens: itens.map((i) => ({
          sku: i.sku,
          description: i.description,
          colorName: i.colorName,
          sizeName: i.sizeName,
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice,
          total: i.total,
          ncm: i.ncm,
          cfop: store?.fiscalDefaultCfop ?? null,
          csosn: store?.fiscalDefaultCsosn ?? null,
        })),
        pagamentos: pagamentos.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.installments,
        })),
        tributosAproximados: tributos,
        observacao: store?.printFooter ?? null,
        qrCodeUrl: null,
      }),
    );
  },
);
