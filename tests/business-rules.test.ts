/**
 * Regras de negócio — testes de integração contra o banco real.
 * Cobrem os fluxos críticos do ERP: cadastro, estoque, venda, cancelamento,
 * crediário, caixa, orçamento, compra, troca, permissões e auditoria.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, adminActor, ensureTestSchema, purgeTestData, stamp, type TestActor } from "./helpers";
import { createProduct } from "@/server/services/products";
import { setStockQuantity } from "@/server/services/stock-ops";
import { cancelSale, createSale, previewSale, type Actor } from "@/server/services/sales";
import { createCustomer } from "@/server/services/customers";
import { addCashMovement, closeSession, getSessionSummary, openSession } from "@/server/services/cash";
import { convertQuoteToSale, createQuote } from "@/server/services/quotes";
import { createPurchaseOrder, receivePurchaseOrder, setPurchaseStatus } from "@/server/services/purchases";
import { createReturn } from "@/server/services/returns";
import { effectivePermissions, ROLE_PERMISSIONS } from "@/server/auth/permissions";

const MARK = stamp("VITEST");
let admin: TestActor;
let actor: Actor;

function actorWith(overrides: Partial<Actor> = {}): Actor {
  return {
    id: admin.id,
    name: admin.name,
    maxDiscountPercent: 100,
    canUnlimitedDiscount: true,
    canNegativeStock: true,
    ...overrides,
  };
}

async function makeProduct(name: string, qty = 10, prices = { cost: "50.00", sale: "120.00" }) {
  const created = await createProduct(
    {
      name,
      costPrice: prices.cost,
      salePrice: prices.sale,
      notes: MARK,
      variants: [{ costPrice: prices.cost, salePrice: prices.sale }],
    },
    admin,
  );
  const variant = created.variants[0] as { id: string; sku: string } | undefined;
  if (!variant) throw new Error("variação não criada");
  if (qty !== 0) {
    await setStockQuantity({
      variantId: variant.id,
      newQuantity: qty,
      reason: `Carga inicial de teste ${MARK}`,
      actor: admin,
    });
  }
  return { product: created.product, variant };
}

async function stockOf(variantId: string) {
  const rows = await db.execute(
    sql`SELECT stock_qty::text AS stock FROM product_variants WHERE id = ${variantId}`,
  );
  return Number((rows.rows as Array<{ stock: string }>)[0].stock);
}

async function firstSaleItemId(saleId: string) {
  const rows = await db.execute(
    sql`SELECT id FROM sale_items WHERE sale_id = ${saleId} ORDER BY created_at LIMIT 1`,
  );
  return String((rows.rows as Array<{ id: string }>)[0].id);
}

const cash = (amount: string) => [{ method: "CASH" as const, amount, tenderedAmount: amount }];

beforeAll(async () => {
  await ensureTestSchema();
  admin = await adminActor();
  actor = actorWith();
  await purgeTestData([MARK]);
});

describe("produtos e estoque", () => {
  it("cria produto com variação, SKU e saldo inicial via movimentação", async () => {
    const { product, variant } = await makeProduct(`${MARK} Vestido Midi`, 7);
    expect(product.id).toBeTruthy();
    expect(variant.sku).toMatch(/^[A-Z0-9-]+$/);
    expect(await stockOf(variant.id)).toBe(7);

    const movements = await db.execute(
      sql`SELECT type FROM stock_movements WHERE variant_id = ${variant.id}`,
    );
    expect((movements.rows as Array<{ type: string }>).map((m) => m.type)).toContain("ADJUSTMENT");
  });

  it("gera SKU distinto para produtos com o mesmo nome", async () => {
    const a = await makeProduct(`${MARK} Blusa Igual`, 1);
    const b = await makeProduct(`${MARK} Blusa Igual`, 1);
    expect(a.variant.sku).not.toBe(b.variant.sku);
  });

  it("rejeita ajuste de estoque sem motivo", async () => {
    const { variant } = await makeProduct(`${MARK} Peça Ajuste`, 2);
    await expect(
      setStockQuantity({ variantId: variant.id, newQuantity: 5, reason: "", actor: admin }),
    ).rejects.toThrow(/motivo/i);
  });
});

describe("venda no PDV", () => {
  it("venda em dinheiro baixa estoque e calcula lucro/troco", async () => {
    const { variant } = await makeProduct(`${MARK} Calça Jeans`, 5, { cost: "40.00", sale: "100.00" });
    const preview = await previewSale({
      items: [{ variantId: variant.id, quantity: 2 }],
      payments: cash("200.00"),
    });
    expect(preview.total).toBe("200.00");
    expect(preview.profit).toBe("120.00");

    const result = await createSale(
      {
        items: [{ variantId: variant.id, quantity: 2 }],
        payments: [{ method: "CASH", amount: "200.00", tenderedAmount: "250.00" }],
        notes: MARK,
      },
      actor,
    );
    expect(result.sale.status).toBe("COMPLETED");
    expect(result.change).toBe("50.00");
    expect(await stockOf(variant.id)).toBe(3);
  });

  it("bloqueia pagamento insuficiente sem tocar no estoque", async () => {
    const { variant } = await makeProduct(`${MARK} Saia`, 3, { cost: "30.00", sale: "90.00" });
    await expect(
      createSale(
        { items: [{ variantId: variant.id, quantity: 1 }], payments: cash("50.00"), notes: MARK },
        actor,
      ),
    ).rejects.toThrow(/insuficiente/i);
    expect(await stockOf(variant.id)).toBe(3);
  });

  it("bloqueia venda sem itens e quantidade inválida", async () => {
    await expect(createSale({ items: [], payments: cash("10.00"), notes: MARK }, actor)).rejects.toThrow();
    const { variant } = await makeProduct(`${MARK} Top Qtd`, 3);
    await expect(
      createSale({ items: [{ variantId: variant.id, quantity: 0 }], payments: cash("10.00") }, actor),
    ).rejects.toThrow();
  });

  it("bloqueia desconto acima do limite do perfil", async () => {
    const { variant } = await makeProduct(`${MARK} Top Desconto`, 3, { cost: "10.00", sale: "100.00" });
    const limited = actorWith({ maxDiscountPercent: 5, canUnlimitedDiscount: false });
    await expect(
      createSale(
        {
          items: [{ variantId: variant.id, quantity: 1 }],
          payments: cash("90.00"),
          discountPercent: 10,
          discountReason: "teste",
          notes: MARK,
        },
        limited,
      ),
    ).rejects.toThrow(/limite/i);
  });

  it("cancelamento devolve estoque e registra auditoria", async () => {
    const { variant } = await makeProduct(`${MARK} Macacão`, 4, { cost: "60.00", sale: "150.00" });
    const { sale } = await createSale(
      { items: [{ variantId: variant.id, quantity: 2 }], payments: cash("300.00"), notes: MARK },
      actor,
    );
    expect(await stockOf(variant.id)).toBe(2);
    await cancelSale({ saleId: sale.id, reason: `Cancelamento de teste ${MARK}`, actor });
    expect(await stockOf(variant.id)).toBe(4);
    const logs = await db.execute(
      sql`SELECT action FROM audit_logs WHERE entity_id = ${sale.id} AND action = 'SALE_CANCEL'`,
    );
    expect(logs.rows.length).toBe(1);
  });

  it("crediário gera parcelas a receber iguais", async () => {
    const { variant } = await makeProduct(`${MARK} Conjunto`, 2, { cost: "100.00", sale: "300.00" });
    const customer = await createCustomer(
      { name: `${MARK} Cliente Crediário`, creditLimit: "1000.00", notes: MARK },
      admin,
    );
    const { sale } = await createSale(
      {
        customerId: customer.id,
        items: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: "CREDIT", amount: "300.00", installments: 3 }],
        notes: MARK,
      },
      actor,
    );
    const rows = (
      await db.execute(
        sql`SELECT amount::text AS amount, status FROM receivables WHERE sale_id = ${sale.id} ORDER BY due_date`,
      )
    ).rows as Array<{ amount: string; status: string }>;
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.amount)).toEqual(["100.00", "100.00", "100.00"]);
    expect(rows.every((r) => r.status === "PENDING")).toBe(true);
  });
});

describe("caixa", () => {
  it("abre, movimenta e fecha conferindo a diferença", async () => {
    const open = await db.execute(
      sql`SELECT id FROM cash_sessions WHERE user_id = ${admin.id} AND status = 'OPEN'`,
    );
    for (const row of open.rows as Array<{ id: string }>) {
      await closeSession({
        sessionId: row.id,
        countedBreakdown: { CASH: 0 },
        notes: `Limpeza de teste ${MARK}`,
        userId: admin.id,
        userName: admin.name,
      });
    }

    const session = await openSession({
      userId: admin.id,
      userName: admin.name,
      openingAmount: "200.00",
      notes: MARK,
    });
    expect(session.status).toBe("OPEN");

    await addCashMovement({
      sessionId: session.id,
      type: "SUPPLY",
      amount: "100.00",
      description: `Suprimento ${MARK}`,
      userId: admin.id,
      userName: admin.name,
    });
    await addCashMovement({
      sessionId: session.id,
      type: "WITHDRAWAL",
      amount: "50.00",
      description: `Sangria ${MARK}`,
      userId: admin.id,
      userName: admin.name,
    });

    const summary = await getSessionSummary(session.id);
    expect(summary.expectedCash).toBe("250.00");

    const closed = await closeSession({
      sessionId: session.id,
      countedBreakdown: { CASH: Number(summary.expectedCash) },
      notes: `Fechamento ${MARK}`,
      userId: admin.id,
      userName: admin.name,
    });
    expect(closed.session.status).toBe("CLOSED");
    expect(closed.difference).toBe("0.00");
  });

  it("não permite abrir dois caixas para o mesmo usuário", async () => {
    const open = await db.execute(
      sql`SELECT id FROM cash_sessions WHERE user_id = ${admin.id} AND status = 'OPEN'`,
    );
    for (const row of open.rows as Array<{ id: string }>) {
      await closeSession({
        sessionId: row.id,
        countedBreakdown: { CASH: 0 },
        notes: `Limpeza ${MARK}`,
        userId: admin.id,
        userName: admin.name,
      });
    }
    const session = await openSession({
      userId: admin.id,
      userName: admin.name,
      openingAmount: "0.00",
      notes: MARK,
    });
    await expect(
      openSession({ userId: admin.id, userName: admin.name, openingAmount: "10.00" }),
    ).rejects.toThrow(/já possui um caixa aberto/i);
    await closeSession({
      sessionId: session.id,
      countedBreakdown: { CASH: 0 },
      notes: `Fim ${MARK}`,
      userId: admin.id,
      userName: admin.name,
    });
  });
});

describe("orçamentos", () => {
  it("cria orçamento e converte em venda", async () => {
    const { variant } = await makeProduct(`${MARK} Vestido Festa`, 3, { cost: "120.00", sale: "400.00" });
    const quote = await createQuote(
      { items: [{ variantId: variant.id, quantity: 1 }], notes: MARK },
      admin,
    );
    expect(quote.status).toBe("OPEN");

    const converted = await convertQuoteToSale({
      quoteId: quote.id,
      payments: cash("400.00"),
      actor,
    });
    expect(converted.sale.id).toBeTruthy();
    expect(await stockOf(variant.id)).toBe(2);

    await expect(
      convertQuoteToSale({ quoteId: quote.id, payments: cash("400.00"), actor }),
    ).rejects.toThrow(/já foi convertido/i);
  });
});

describe("compras", () => {
  it("recebimento dá entrada no estoque e gera contas a pagar", async () => {
    const { variant } = await makeProduct(`${MARK} Peça Compra`, 0, { cost: "25.00", sale: "70.00" });
    const supplier = await db.execute(sql`
      INSERT INTO suppliers (legal_name, notes)
      VALUES (${`${MARK} Fornecedor`}, ${MARK}) RETURNING id
    `);
    const supplierId = String((supplier.rows as Array<{ id: string }>)[0].id);

    const order = await createPurchaseOrder(
      {
        supplierId,
        items: [{ variantId: variant.id, description: `${MARK} Peça Compra`, quantity: 6, unitCost: "25.00" }],
        notes: MARK,
      },
      admin,
    );
    expect(order.status).toBe("DRAFT");

    await setPurchaseStatus(order.id, "ORDERED", admin);
    const detail = await db.execute(
      sql`SELECT id FROM purchase_items WHERE purchase_order_id = ${order.id}`,
    );
    const itemId = String((detail.rows as Array<{ id: string }>)[0].id);

    const received = await receivePurchaseOrder({
      orderId: order.id,
      items: [{ itemId, receivedQty: 6 }],
      actor: admin,
    });
    expect(received.order.status).toBe("RECEIVED");
    expect(await stockOf(variant.id)).toBe(6);

    const payables = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM payables WHERE purchase_order_id = ${order.id}`,
    );
    expect(Number((payables.rows as Array<{ n: number }>)[0].n)).toBeGreaterThan(0);
  });
});

describe("trocas e devoluções", () => {
  it("troca devolve o item ao estoque e gera vale-crédito", async () => {
    const { variant } = await makeProduct(`${MARK} Short`, 5, { cost: "20.00", sale: "80.00" });
    const customer = await createCustomer({ name: `${MARK} Cliente Troca`, notes: MARK }, admin);
    const { sale } = await createSale(
      {
        customerId: customer.id,
        items: [{ variantId: variant.id, quantity: 2 }],
        payments: cash("160.00"),
        notes: MARK,
      },
      actor,
    );
    expect(await stockOf(variant.id)).toBe(3);

    const result = await createReturn(
      {
        saleId: sale.id,
        type: "RETURN",
        reason: "Tamanho não serviu",
        items: [{ saleItemId: await firstSaleItemId(sale.id), quantity: 1, action: "RESTOCK" }],
        refundMethod: "STORE_CREDIT",
        notes: MARK,
      },
      actor,
    );
    expect(result.returnRecord.id).toBeTruthy();
    expect(await stockOf(variant.id)).toBe(4);

    const credit = await db.execute(
      sql`SELECT COALESCE(SUM(amount),0)::text AS total FROM customer_credits WHERE customer_id = ${customer.id}`,
    );
    expect(Number((credit.rows as Array<{ total: string }>)[0].total)).toBeGreaterThan(0);
  });
});

describe("permissões", () => {
  it("vendedora não acessa gestão de usuários nem configurações", () => {
    const seller = effectivePermissions({ role: "SELLER" });
    expect(seller).toContain("sales.create");
    expect(seller).not.toContain("users.manage");
    expect(seller).not.toContain("settings.manage");
    expect(seller).not.toContain("audit.view");
  });

  it("negação individual prevalece sobre o perfil", () => {
    const perms = effectivePermissions({
      role: "MANAGER",
      extraPermissions: ["audit.view"],
      deniedPermissions: ["reports.export", "audit.view"],
    });
    expect(perms).not.toContain("audit.view");
    expect(perms).not.toContain("reports.export");
    expect(perms).toContain("sales.create");
  });

  it("administrador mantém permissões mínimas de administração", () => {
    const perms = effectivePermissions({ role: "ADMIN", deniedPermissions: ["users.manage"] });
    expect(perms).toContain("users.view");
    expect(perms).toContain("users.manage");
    expect(ROLE_PERMISSIONS.ADMIN.length).toBeGreaterThan(30);
  });
});

describe("auditoria", () => {
  it("registra criação de cliente com o usuário responsável", async () => {
    const customer = await createCustomer({ name: `${MARK} Cliente Auditoria`, notes: MARK }, admin);
    const rows = await db.execute(
      sql`SELECT action, user_id, user_name FROM audit_logs
           WHERE entity_id = ${customer.id} AND action = 'CUSTOMER_CREATE'`,
    );
    const log = (rows.rows as Array<{ action: string; user_id: string; user_name: string }>)[0];
    expect(log.action).toBe("CUSTOMER_CREATE");
    expect(log.user_id).toBe(admin.id);
  });
});
