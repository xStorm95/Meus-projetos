/**
 * Serviço fiscal — camada de ARQUITETURA de integração.
 *
 * IMPORTANTE: este módulo NÃO emite documentos fiscais. Ele registra a
 * intenção, valida os dados obrigatórios e cria documentos em status PENDING
 * para que um provedor externo (Focus NFe, eNotas, Tecnospeed, PlugNotas...)
 * processe a transmissão. Nunca gravamos "AUTHORIZED" sem resposta real da
 * SEFAZ via provedor configurado — a coluna de status só muda pelo retorno do
 * provedor (integração futura) ou por cancelamento manual homologado.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { customers, fiscalDocuments, sales, users } from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { money } from "../lib/money";
import { writeAudit } from "../lib/audit";
import { getSettingsCached } from "./settings";

type Actor = { id: string; name: string };

export type FiscalReadiness = {
  ready: boolean;
  provider: string | null;
  environment: "HOMOLOGATION" | "PRODUCTION";
  checks: Array<{ key: string; label: string; ok: boolean; hint: string }>;
};

/** Verifica se o ambiente está pronto para uma integração real. */
export async function fiscalReadiness(): Promise<FiscalReadiness> {
  const s = await getSettingsCached();
  const checks: FiscalReadiness["checks"] = [
    {
      key: "provider",
      label: "Provedor de emissão configurado",
      ok: Boolean(s.fiscalProvider?.trim()),
      hint: "Informe o provedor em Configurações → Fiscal (ex.: Focus NFe).",
    },
    {
      key: "company",
      label: "CNPJ e razão social da empresa",
      ok: Boolean(s.companyDocument && s.companyLegalName),
      hint: "O documento fiscal exige CNPJ válido e razão social.",
    },
    {
      key: "address",
      label: "Endereço completo do estabelecimento",
      ok: Boolean(s.companyAddress && s.companyCity && s.companyState && s.companyZip),
      hint: "Rua, cidade, UF e CEP são obrigatórios na NF-e/NFC-e.",
    },
    {
      key: "csc",
      label: "CSC e token da NFC-e",
      ok: Boolean(s.fiscalCscId && s.fiscalCscToken),
      hint: "O CSC é fornecido pela SEFAZ estadual para NFC-e.",
    },
    {
      key: "certificate",
      label: "Certificado digital A1 registrado",
      ok: Boolean(s.fiscalCertificateName),
      hint: "O certificado deve ser instalado no servidor com validade vigente.",
    },
    {
      key: "ncm",
      label: "NCM/CSOSN padrão definidos",
      ok: Boolean(s.fiscalDefaultNcm && s.fiscalDefaultCsosn),
      hint: "Cada produto precisa de NCM; o CSOSN define a tributação do Simples.",
    },
  ];
  return {
    ready: checks.every((c) => c.ok),
    provider: s.fiscalProvider,
    environment: s.fiscalEnvironment,
    checks,
  };
}

/** Fila de documentos fiscais (preparados, não transmitidos). */
export async function listFiscalDocuments(params: {
  status?: string;
  model?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 25);
  const conds = [];
  if (params.status && params.status !== "ALL") conds.push(eq(fiscalDocuments.status, params.status as never));
  if (params.model && params.model !== "ALL") conds.push(eq(fiscalDocuments.model, params.model));
  if (params.from) conds.push(gte(fiscalDocuments.createdAt, new Date(`${params.from}T00:00:00Z`)));
  if (params.to) conds.push(lt(fiscalDocuments.createdAt, new Date(`${params.to}T23:59:59Z`)));
  const where = conds.length ? and(...conds) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        doc: fiscalDocuments,
        saleNumber: sales.number,
        customerName: customers.name,
        userName: users.name,
      })
      .from(fiscalDocuments)
      .leftJoin(sales, eq(sales.id, fiscalDocuments.saleId))
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.sellerId))
      .where(where)
      .orderBy(desc(fiscalDocuments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${fiscalDocuments.status} = 'PENDING')::int`,
        authorized: sql<number>`COUNT(*) FILTER (WHERE ${fiscalDocuments.status} = 'AUTHORIZED')::int`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE ${fiscalDocuments.status} = 'REJECTED')::int`,
        total: sql<string>`COALESCE(SUM(${fiscalDocuments.total}), 0)::text`,
      })
      .from(fiscalDocuments)
      .where(where),
  ]);

  return {
    items: items.map((row) => ({
      ...row.doc,
      createdAt: row.doc.createdAt.toISOString(),
      issuedAt: row.doc.issuedAt ? row.doc.issuedAt.toISOString() : null,
      canceledAt: row.doc.canceledAt ? row.doc.canceledAt.toISOString() : null,
      saleNumber: row.saleNumber,
      customerName: row.customerName,
      userName: row.userName,
    })),
    total: Number(totals[0]?.count ?? 0),
    totals: {
      pending: Number(totals[0]?.pending ?? 0),
      authorized: Number(totals[0]?.authorized ?? 0),
      rejected: Number(totals[0]?.rejected ?? 0),
      value: money(totals[0]?.total ?? 0),
    },
    page,
    pageSize,
  };
}

/**
 * Prepara um documento fiscal a partir de uma venda.
 * Não transmite nada: exige provedor e ambiente configurados; caso contrário
 * apenas registra o documento como PENDING (fila) para integração posterior.
 */
export async function prepareFiscalDocument(
  params: { saleId: string; model?: "65" | "55"; force?: boolean },
  actor: Actor,
) {
  const readiness = await fiscalReadiness();
  const model = params.model ?? "65";

  const rows = await db
    .select({
      sale: sales,
      customerName: customers.name,
      customerDocument: customers.document,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.id, params.saleId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Venda");
  if (row.sale.status !== "COMPLETED") {
    throw new BusinessRuleError("Somente vendas concluídas podem gerar documento fiscal.");
  }
  if (model === "55" && !row.customerDocument) {
    throw new BusinessRuleError("A NF-e exige o documento (CPF/CNPJ) do destinatário.");
  }

  const existing = await db
    .select({ id: fiscalDocuments.id, status: fiscalDocuments.status })
    .from(fiscalDocuments)
    .where(and(eq(fiscalDocuments.saleId, params.saleId), eq(fiscalDocuments.model, model)))
    .limit(1);
  if (existing[0] && !params.force) {
    throw new BusinessRuleError(
      `Esta venda já possui ${model === "65" ? "NFC-e" : "NF-e"} registrada (situação ${existing[0].status}).`,
    );
  }

  if (!readiness.ready && !params.force) {
    throw new BusinessRuleError(
      `Integração fiscal incompleta: ${readiness.checks
        .filter((c) => !c.ok)
        .map((c) => c.label)
        .join(", ")}. Ajuste em Configurações → Fiscal.`,
    );
  }

  const settings = await getSettingsCached();
  const series = model === "65" ? settings.fiscalSeriesNfce : settings.fiscalSeriesNfe;
  const next = model === "65" ? settings.fiscalNextNumberNfce : settings.fiscalNextNumberNfe;

  const [doc] = await db
    .insert(fiscalDocuments)
    .values({
      saleId: row.sale.id,
      model,
      series,
      number: next,
      environment: settings.fiscalEnvironment,
      status: "PENDING",
      total: row.sale.total,
      provider: settings.fiscalProvider,
      requestPayload: {
        preparedAt: new Date().toISOString(),
        preparedBy: actor.name,
        saleNumber: row.sale.number,
        customer: row.customerName,
        customerDocument: row.customerDocument,
        itemsPending: true,
        note: "Documento preparado no ERP. Transmissão depende do provedor configurado.",
      },
    })
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "FISCAL_PREPARE",
    entity: "fiscal_document",
    entityId: doc.id,
    description: `Documento fiscal modelo ${model} nº ${next} preparado para a venda #${row.sale.number} (sem transmissão).`,
  });

  return doc;
}

/** Cancela um documento registrado no ERP (não substitui o cancelamento na SEFAZ). */
export async function cancelFiscalDocument(id: string, reason: string, actor: Actor) {
  if (!reason?.trim()) throw new BusinessRuleError("Informe o motivo do cancelamento.");
  const rows = await db.select().from(fiscalDocuments).where(eq(fiscalDocuments.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Documento fiscal");
  if (doc.status === "CANCELED") throw new BusinessRuleError("Documento já cancelado.");

  const [updated] = await db
    .update(fiscalDocuments)
    .set({ status: "CANCELED", canceledAt: new Date(), cancelReason: reason })
    .where(eq(fiscalDocuments.id, id))
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "FISCAL_CANCEL",
    entity: "fiscal_document",
    entityId: id,
    description: `Cancelamento local do documento ${doc.model}/${doc.series}/${doc.number}: ${reason}`,
    before: { status: doc.status },
    after: { status: "CANCELED" },
  });
  return updated;
}

/** Vendas concluídas sem documento fiscal (fila operacional). */
export async function salesWithoutFiscalDocument(limit = 50) {
  const rows = await db.execute(sql`
    SELECT s.id, s.number, s.total::text, s.completed_at, c.name AS customer_name, c.document AS customer_document,
           (SELECT COUNT(*) FROM fiscal_documents fd WHERE fd.sale_id = s.id)::int AS documents
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.status = 'COMPLETED'
       AND s.completed_at >= now() - interval '90 days'
       AND NOT EXISTS (SELECT 1 FROM fiscal_documents fd WHERE fd.sale_id = s.id AND fd.status <> 'CANCELED')
     ORDER BY s.completed_at DESC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    number: Number(r.number),
    total: money(String(r.total ?? 0)),
    completedAt: r.completed_at ? String(r.completed_at) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    customerDocument: r.customer_document ? String(r.customer_document) : null,
    documents: Number(r.documents ?? 0),
  }));
}

/** Estatísticas para o painel fiscal. */
export async function fiscalStats() {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'AUTHORIZED')::int AS authorized,
      COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
      COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled,
      COALESCE(SUM(total) FILTER (WHERE status = 'AUTHORIZED'), 0)::text AS authorized_value
      FROM fiscal_documents
  `);
  const r = (rows.rows as Array<Record<string, string | number>>)[0] ?? {};
  return {
    total: Number(r.total ?? 0),
    pending: Number(r.pending ?? 0),
    authorized: Number(r.authorized ?? 0),
    rejected: Number(r.rejected ?? 0),
    canceled: Number(r.canceled ?? 0),
    authorizedValue: money(String(r.authorized_value ?? 0)),
  };
}
