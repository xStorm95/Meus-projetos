/**
 * Serviço de clientes (CRM).
 * Classificações (novo, recorrente, VIP, inativo, aniversariante, inadimplente)
 * são calculadas a partir do histórico real de compras e do crediário.
 */
import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { customerCredits, customers, receivables, sales } from "../db/schema";
import { ConflictError, NotFoundError } from "../lib/errors";
import { money } from "../lib/money";
import { classifyCustomer, customerSummary } from "./returns";
import { writeAudit } from "../lib/audit";

export type CustomerInput = {
  name: string;
  document?: string | null;
  personType?: string;
  birthDate?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  sizePreference?: string | null;
  creditLimit?: string | number;
  isActive?: boolean;
  acceptsWhatsapp?: boolean;
  acceptsEmail?: boolean;
  lgpdConsent?: boolean;
  lgpdConsentSource?: string | null;
};

export async function createCustomer(input: CustomerInput, actor: { id: string; name: string }) {
  if (!input.name?.trim()) throw new Error("Informe o nome do cliente.");
  const digits = (input.document ?? "").replace(/\D/g, "");
  if (digits) {
    const existing = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.document, digits), isNull(customers.deletedAt)))
      .limit(1);
    if (existing[0]) {
      throw new ConflictError(
        `Já existe um cliente cadastrado com este documento: ${existing[0].name}.`,
      );
    }
  }

  const [customer] = await db
    .insert(customers)
    .values({
      name: input.name.trim(),
      document: digits || null,
      personType: input.personType ?? (digits.length > 11 ? "PJ" : "PF"),
      birthDate: input.birthDate || null,
      phone: input.phone ? input.phone.replace(/\D/g, "") : null,
      whatsapp: input.whatsapp ? input.whatsapp.replace(/\D/g, "") : null,
      email: input.email || null,
      address: input.address || null,
      addressNumber: input.addressNumber || null,
      district: input.district || null,
      city: input.city || null,
      state: input.state || null,
      zip: input.zip ? input.zip.replace(/\D/g, "") : null,
      notes: input.notes || null,
      sizePreference: input.sizePreference || null,
      creditLimit: money(input.creditLimit ?? 0),
      isActive: input.isActive ?? true,
      acceptsWhatsapp: input.acceptsWhatsapp ?? false,
      acceptsEmail: input.acceptsEmail ?? false,
      lgpdConsentAt: input.lgpdConsent ? new Date() : null,
      lgpdConsentSource: input.lgpdConsent ? (input.lgpdConsentSource ?? "cadastro") : null,
      createdBy: actor.id,
    })
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "CUSTOMER_CREATE",
    entity: "customer",
    entityId: customer.id,
    description: `Cliente "${customer.name}" cadastrado`,
  });

  return customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>, actor: { id: string; name: string }) {
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Cliente");

  const patch: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.document !== undefined) patch.document = input.document ? input.document.replace(/\D/g, "") : null;
  if (input.birthDate !== undefined) patch.birthDate = input.birthDate || null;
  if (input.phone !== undefined) patch.phone = input.phone ? input.phone.replace(/\D/g, "") : null;
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp ? input.whatsapp.replace(/\D/g, "") : null;
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.address !== undefined) patch.address = input.address || null;
  if (input.addressNumber !== undefined) patch.addressNumber = input.addressNumber || null;
  if (input.district !== undefined) patch.district = input.district || null;
  if (input.city !== undefined) patch.city = input.city || null;
  if (input.state !== undefined) patch.state = input.state || null;
  if (input.zip !== undefined) patch.zip = input.zip ? input.zip.replace(/\D/g, "") : null;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.sizePreference !== undefined) patch.sizePreference = input.sizePreference || null;
  if (input.creditLimit !== undefined) patch.creditLimit = money(input.creditLimit);
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.acceptsWhatsapp !== undefined) patch.acceptsWhatsapp = input.acceptsWhatsapp;
  if (input.acceptsEmail !== undefined) patch.acceptsEmail = input.acceptsEmail;

  const [updated] = await db.update(customers).set(patch).where(eq(customers.id, id)).returning();
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "CUSTOMER_UPDATE",
    entity: "customer",
    entityId: id,
    description: `Cliente "${updated.name}" atualizado`,
    before: { name: rows[0].name, creditLimit: rows[0].creditLimit },
    after: { name: updated.name, creditLimit: updated.creditLimit },
  });
  return updated;
}

/** Exclusão LGPD: anonimiza mantendo histórico financeiro (não apaga recebíveis). */
export async function anonymizeCustomer(id: string, actor: { id: string; name: string }) {
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Cliente");

  const hasOpenDebt = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(receivables)
    .where(
      and(
        eq(receivables.customerId, id),
        sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`,
      ),
    );
  if (Number(hasOpenDebt[0]?.count ?? 0) > 0) {
    throw new Error(
      "Este cliente possui parcelas em aberto. Quite ou cancele o crediário antes de excluir os dados.",
    );
  }

  const [updated] = await db
    .update(customers)
    .set({
      name: `Cliente removido ${id.slice(0, 6)}`,
      document: null,
      email: null,
      phone: null,
      whatsapp: null,
      address: null,
      addressNumber: null,
      district: null,
      city: null,
      state: null,
      zip: null,
      birthDate: null,
      notes: "Dados pessoais removidos a pedido do titular (LGPD).",
      isActive: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id))
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "CUSTOMER_ANONYMIZE",
    entity: "customer",
    entityId: id,
    description: "Dados pessoais do cliente removidos (LGPD), histórico financeiro preservado",
    before: { name: rows[0].name, document: rows[0].document },
  });
  return updated;
}

export async function listCustomers(params: {
  search?: string;
  classification?: string;
  page?: number;
  pageSize?: number;
  birthdaysMonth?: number;
  inactiveDays?: number;
}) {
  const conds: SQL[] = [isNull(customers.deletedAt)];
  if (params.search) {
    const term = `%${params.search}%`;
    const digits = params.search.replace(/\D/g, "");
    conds.push(
      or(
        ilike(customers.name, term),
        ilike(customers.phone, term),
        ilike(customers.email, term),
        digits.length >= 4 ? ilike(customers.document, `%${digits}%`) : undefined,
      )!,
    );
  }
  if (params.birthdaysMonth) {
    conds.push(sql`to_char(${customers.birthDate}, 'MM') = ${String(params.birthdaysMonth).padStart(2, "0")}`);
  }

  const where = and(...conds);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);

  const stats = {
    purchases: sql<number>`COALESCE((SELECT COUNT(*) FROM sales s WHERE s.customer_id = ${customers.id} AND s.status = 'COMPLETED'), 0)::int`,
    totalSpent: sql<string>`COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = ${customers.id} AND s.status = 'COMPLETED'), 0)::text`,
    lastPurchase: sql<string | null>`(SELECT MAX(s.completed_at)::text FROM sales s WHERE s.customer_id = ${customers.id} AND s.status = 'COMPLETED')`,
    debt: sql<string>`COALESCE((SELECT SUM(r.amount - r.paid_amount) FROM receivables r WHERE r.customer_id = ${customers.id} AND r.status IN ('PENDING','PARTIAL','OVERDUE')), 0)::text`,
    overdueDebt: sql<string>`COALESCE((SELECT SUM(r.amount - r.paid_amount) FROM receivables r WHERE r.customer_id = ${customers.id} AND r.status IN ('PENDING','PARTIAL','OVERDUE') AND r.due_date < CURRENT_DATE), 0)::text`,
    credits: sql<string>`COALESCE((SELECT SUM(c.amount - c.used_amount) FROM customer_credits c WHERE c.customer_id = ${customers.id} AND c.is_active = true), 0)::text`,
  };

  let classificationFilter: SQL | undefined;
  if (params.classification === "VIP") {
    classificationFilter = sql`${stats.totalSpent}::numeric >= 1500 OR ${stats.purchases} >= 8`;
  } else if (params.classification === "INACTIVE") {
    classificationFilter = sql`${stats.lastPurchase} IS NOT NULL AND ${stats.lastPurchase}::timestamptz < now() - interval '90 days'`;
  } else if (params.classification === "DELINQUENT") {
    classificationFilter = sql`${stats.overdueDebt}::numeric > 0`;
  } else if (params.classification === "NEW") {
    classificationFilter = sql`${stats.purchases} <= 1`;
  } else if (params.classification === "RECURRING") {
    classificationFilter = sql`${stats.purchases} >= 2`;
  }

  const finalWhere = classificationFilter ? and(where, classificationFilter) : where;

  const [items, countRows] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        document: customers.document,
        phone: customers.phone,
        whatsapp: customers.whatsapp,
        email: customers.email,
        birthDate: customers.birthDate,
        city: customers.city,
        state: customers.state,
        creditLimit: customers.creditLimit,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        ...stats,
      })
      .from(customers)
      .where(finalWhere)
      .orderBy(asc(customers.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(customers).where(finalWhere),
  ]);

  return {
    items: items.map((c) => ({
      ...c,
      totalSpent: money(c.totalSpent),
      debt: money(c.debt),
      overdueDebt: money(c.overdueDebt),
      credits: money(c.credits),
      creditLimit: money(c.creditLimit),
      classifications: classifyCustomer({
        purchaseCount: Number(c.purchases),
        totalSpent: money(c.totalSpent),
        lastPurchase: c.lastPurchase,
        hasOpenDebt: Number(c.debt) > 0,
        hasOverdue: Number(c.overdueDebt) > 0,
        birthDate: c.birthDate,
      }),
      createdAt: c.createdAt.toISOString(),
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

export async function getCustomerDetail(id: string) {
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  const customer = rows[0];
  if (!customer) throw new NotFoundError("Cliente");

  const [summary, purchases, openInstallments, credits, returns] = await Promise.all([
    customerSummary(id),
    db
      .select({
        id: sales.id,
        number: sales.number,
        total: sales.total,
        itemCount: sales.itemCount,
        status: sales.status,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .where(eq(sales.customerId, id))
      .orderBy(desc(sales.createdAt))
      .limit(50),
    db
      .select()
      .from(receivables)
      .where(
        and(
          eq(receivables.customerId, id),
          sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`,
        ),
      )
      .orderBy(asc(receivables.dueDate)),
    db
      .select()
      .from(customerCredits)
      .where(and(eq(customerCredits.customerId, id), eq(customerCredits.isActive, true))),
    db.execute(sql`
      SELECT r.id, r.code, r.type, r.reason, r.returned_total, r.created_at, s.number AS sale_number
        FROM returns r LEFT JOIN sales s ON s.id = r.sale_id
       WHERE r.customer_id = ${id}
       ORDER BY r.created_at DESC LIMIT 20
    `),
  ]);

  const favoriteProducts = await db.execute(sql`
    SELECT p.name, p.reference, SUM(si.quantity)::text AS qty, COUNT(DISTINCT s.id)::int AS compras
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
     WHERE s.customer_id = ${id} AND s.status = 'COMPLETED'
     GROUP BY p.id, p.name, p.reference
     ORDER BY SUM(si.quantity) DESC
     LIMIT 5
  `);

  return {
    customer,
    summary,
    purchases: purchases.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    openInstallments,
    credits: credits.map((c) => ({
      ...c,
      amount: money(c.amount),
      usedAmount: money(c.usedAmount),
      available: money(Number(c.amount) - Number(c.usedAmount)),
      createdAt: c.createdAt.toISOString(),
    })),
    returns: (returns.rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      code: String(r.code),
      type: String(r.type),
      reason: String(r.reason),
      returnedTotal: money(String(r.returned_total)),
      saleNumber: r.sale_number ? Number(r.sale_number) : null,
      createdAt: String(r.created_at),
    })),
    favoriteProducts: (favoriteProducts.rows as Array<{ name: string; reference: string; qty: string; compras: number }>).map(
      (p) => ({ name: p.name, reference: p.reference, quantity: Number(p.qty), purchases: Number(p.compras) }),
    ),
  };
}

/** Relatórios de CRM: inativos por período, top clientes, aniversariantes. */
export async function customerReports(params: {
  type: "inactive30" | "inactive60" | "inactive90" | "top" | "churned" | "birthdays";
  month?: number;
}) {
  if (params.type === "birthdays") {
    const month = params.month ?? new Date().getUTCMonth() + 1;
    const rows = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        whatsapp: customers.whatsapp,
        birthDate: customers.birthDate,
        acceptsWhatsapp: customers.acceptsWhatsapp,
      })
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          eq(customers.isActive, true),
          sql`to_char(${customers.birthDate}, 'MM') = ${String(month).padStart(2, "0")}`,
        ),
      )
      .orderBy(sql`to_char(${customers.birthDate}, 'DD')`)
      .limit(300);
    return { items: rows, type: params.type, month };
  }

  if (params.type === "top") {
    const rows = await db.execute(sql`
      SELECT c.id, c.name, c.phone, COUNT(s.id)::int AS compras,
             COALESCE(SUM(s.total), 0)::text AS total,
             COALESCE(AVG(s.total), 0)::text AS ticket_medio,
             MAX(s.completed_at)::text AS ultima_compra
        FROM customers c
        JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
       WHERE c.deleted_at IS NULL
       GROUP BY c.id, c.name, c.phone
       ORDER BY SUM(s.total) DESC
       LIMIT 100
    `);
    return { items: rows.rows, type: params.type };
  }

  const days = params.type === "inactive30" ? 30 : params.type === "inactive60" ? 60 : 90;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.phone, c.whatsapp, c.accepts_whatsapp,
           MAX(s.completed_at)::text AS ultima_compra,
           COUNT(s.id)::int AS compras,
           COALESCE(SUM(s.total), 0)::text AS total_gasto,
           (CURRENT_DATE - MAX(s.completed_at)::date)::int AS dias_sem_comprar
      FROM customers c
      JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
     WHERE c.deleted_at IS NULL AND c.is_active = true
     GROUP BY c.id, c.name, c.phone, c.whatsapp, c.accepts_whatsapp
    HAVING MAX(s.completed_at) < ${cutoff}
     ORDER BY MAX(s.completed_at) ASC
     LIMIT 300
  `);
  return { items: rows.rows, type: params.type, days, cutoff: cutoff.toISOString() };
}

void gte;
void lt;
