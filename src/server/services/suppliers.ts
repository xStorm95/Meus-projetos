/**
 * Serviço de fornecedores.
 * Cadastro usado por compras, contas a pagar e sugestões de reposição.
 */
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { payables, products, purchaseOrders, suppliers } from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { money, d } from "../lib/money";
import { writeAudit } from "../lib/audit";

export type SupplierInput = {
  legalName: string;
  tradeName?: string | null;
  document?: string | null;
  stateRegistration?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export async function createSupplier(input: SupplierInput, actor: { id: string; name: string }) {
  const document = input.document?.replace(/\D/g, "") || null;
  if (document) {
    const existing = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.document, document))
      .limit(1);
    if (existing[0]) throw new BusinessRuleError("Já existe um fornecedor com este documento.");
  }
  const [created] = await db
    .insert(suppliers)
    .values({
      legalName: input.legalName.trim(),
      tradeName: input.tradeName || null,
      document,
      stateRegistration: input.stateRegistration || null,
      contactName: input.contactName || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      addressNumber: input.addressNumber || null,
      district: input.district || null,
      city: input.city || null,
      state: input.state || null,
      zip: input.zip || null,
      paymentTerms: input.paymentTerms || null,
      notes: input.notes || null,
      isActive: input.isActive ?? true,
    })
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "SUPPLIER_CREATE",
    entity: "supplier",
    entityId: created.id,
    description: `Fornecedor cadastrado: ${created.legalName}`,
  });
  return created;
}

export async function updateSupplier(id: string, input: Partial<SupplierInput>, actor: { id: string; name: string }) {
  const rows = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Fornecedor");
  const [updated] = await db
    .update(suppliers)
    .set({
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
      ...(input.tradeName !== undefined ? { tradeName: input.tradeName || null } : {}),
      ...(input.document !== undefined ? { document: input.document?.replace(/\D/g, "") || null } : {}),
      ...(input.stateRegistration !== undefined ? { stateRegistration: input.stateRegistration || null } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.address !== undefined ? { address: input.address || null } : {}),
      ...(input.addressNumber !== undefined ? { addressNumber: input.addressNumber || null } : {}),
      ...(input.district !== undefined ? { district: input.district || null } : {}),
      ...(input.city !== undefined ? { city: input.city || null } : {}),
      ...(input.state !== undefined ? { state: input.state || null } : {}),
      ...(input.zip !== undefined ? { zip: input.zip || null } : {}),
      ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: "SUPPLIER_UPDATE",
    entity: "supplier",
    entityId: id,
    description: `Fornecedor atualizado: ${updated.legalName}`,
    before: { legalName: rows[0].legalName, isActive: rows[0].isActive },
    after: { legalName: updated.legalName, isActive: updated.isActive },
  });
  return updated;
}

export async function listSuppliers(params: {
  search?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, params.pageSize ?? 25);
  const conds = [];
  if (params.search) {
    const term = `%${params.search}%`;
    conds.push(or(ilike(suppliers.legalName, term), ilike(suppliers.tradeName, term), ilike(suppliers.document, term))!);
  }
  if (params.status === "ACTIVE") conds.push(eq(suppliers.isActive, true));
  if (params.status === "INACTIVE") conds.push(eq(suppliers.isActive, false));
  const where = conds.length ? and(...conds) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        supplier: suppliers,
        productsCount: sql<number>`(SELECT COUNT(*)::int FROM products WHERE supplier_id = ${suppliers.id})`,
        openPayables: sql<string>`(
          SELECT COALESCE(SUM(amount - paid_amount), 0)::text FROM payables
           WHERE supplier_id = ${suppliers.id} AND status IN ('PENDING','PARTIAL')
        )`,
        lastPurchase: sql<string | null>`(
          SELECT MAX(issue_date)::text FROM purchase_orders WHERE supplier_id = ${suppliers.id}
        )`,
        purchasesCount: sql<number>`(SELECT COUNT(*)::int FROM purchase_orders WHERE supplier_id = ${suppliers.id})`,
      })
      .from(suppliers)
      .where(where)
      .orderBy(asc(suppliers.legalName))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(suppliers).where(where),
  ]);

  return {
    items: items.map((row) => ({
      ...row.supplier,
      createdAt: row.supplier.createdAt.toISOString(),
      productsCount: Number(row.productsCount ?? 0),
      openPayables: money(row.openPayables ?? 0),
      purchasesCount: Number(row.purchasesCount ?? 0),
      lastPurchase: row.lastPurchase ?? null,
    })),
    total: Number(totals[0]?.count ?? 0),
    page,
    pageSize,
  };
}

export async function getSupplier(id: string) {
  const rows = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Fornecedor");

  const [linkedProducts, orders, openPayables] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        reference: products.reference,
        costPrice: products.costPrice,
        salePrice: products.salePrice,
        status: products.status,
      })
      .from(products)
      .where(and(eq(products.supplierId, id)))
      .orderBy(asc(products.name))
      .limit(100),
    db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, id))
      .orderBy(desc(purchaseOrders.issueDate))
      .limit(30),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${payables.amount} - ${payables.paidAmount}), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(payables)
      .where(and(eq(payables.supplierId, id), sql`${payables.status} IN ('PENDING','PARTIAL')`)),
  ]);

  const supplier = rows[0];
  return {
    supplier: {
      ...supplier,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    },
    products: linkedProducts,
    orders: orders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      receivedAt: o.receivedAt ? o.receivedAt.toISOString() : null,
    })),
    payables: { open: money(openPayables[0]?.total ?? 0), count: Number(openPayables[0]?.count ?? 0) },
  };
}

/** Indicadores de compras por fornecedor (usado nos relatórios). */
export async function supplierStats(from: string, to: string) {
  const rows = await db.execute(sql`
    SELECT s.id, s.legal_name,
           COUNT(po.id)::int AS orders,
           COALESCE(SUM(po.total), 0)::text AS total,
           COALESCE(AVG(po.total), 0)::text AS average,
           MAX(po.issue_date)::text AS last_order
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
        AND po.issue_date >= ${from} AND po.issue_date <= ${to}
       AND po.status <> 'CANCELED'
     GROUP BY s.id, s.legal_name
     ORDER BY COALESCE(SUM(po.total), 0) DESC
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    legalName: String(r.legal_name),
    orders: Number(r.orders ?? 0),
    total: money(String(r.total ?? 0)),
    average: money(String(r.average ?? 0)),
    lastOrder: r.last_order ? String(r.last_order) : null,
  }));
}

export async function suppliersWithDebt() {
  const rows = await db.execute(sql`
    SELECT s.id, s.legal_name, COALESCE(SUM(p.amount - p.paid_amount), 0)::text AS open_amount,
           COUNT(p.id)::int AS open_count,
           MIN(p.due_date)::text AS next_due
      FROM suppliers s
      JOIN payables p ON p.supplier_id = s.id AND p.status IN ('PENDING','PARTIAL')
     GROUP BY s.id, s.legal_name
     HAVING SUM(p.amount - p.paid_amount) > 0
     ORDER BY SUM(p.amount - p.paid_amount) DESC
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    legalName: String(r.legal_name),
    openAmount: money(String(r.open_amount ?? 0)),
    openCount: Number(r.open_count ?? 0),
    nextDue: r.next_due ? String(r.next_due) : null,
  }));
}

export const supplierMoney = { money, d };
