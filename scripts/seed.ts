/**
 * Dados de demonstração — CLARAMENTE IDENTIFICADOS.
 *
 * Uso: npm run db:demo
 * Estes dados servem para avaliar o sistema com volume realista. Tudo que é
 * criado aqui fica marcado como demonstração (referências, nomes e a tabela
 * de auditoria com ação SEED_DEMO). Em produção, NÃO execute este script.
 *
 * O banco NUNCA depende destes dados: o sistema funciona vazio.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, getPool } from "../src/server/db/client";
import { categories, colors, products, sizes, suppliers, users } from "../src/server/db/schema";
import { createProduct } from "../src/server/services/products";
import { createCustomer } from "../src/server/services/customers";
import { createSale } from "../src/server/services/sales";
import { openSession } from "../src/server/services/cash";
import { createPayable } from "../src/server/services/finance";
import { money } from "../src/server/lib/money";
import { addDaysKey, todayKey } from "../src/server/lib/dates";

const DEMO = "[DEMO]";

function random(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PRODUCTS = [
  { name: "Vestido Midi Floral", cat: "Vestidos", cost: 62, sale: 189.9, colors: ["Off-white", "Rosé", "Azul"], sizes: ["P", "M", "G", "GG"] },
  { name: "Calça Jeans Skinny", cat: "Calças", cost: 58, sale: 169.9, colors: ["Azul Jeans", "Preto", "Off-white"], sizes: ["36", "38", "40", "42", "44", "46"] },
  { name: "Blusa Cropped Canelada", cat: "Blusas", cost: 24, sale: 79.9, colors: ["Preto", "Branco", "Nude", "Vermelho"], sizes: ["P", "M", "G"] },
  { name: "Conjunto Alfaiataria", cat: "Conjuntos", cost: 118, sale: 349.9, colors: ["Off-white", "Preto", "Bege"], sizes: ["P", "M", "G", "GG"] },
  { name: "Saia Plissada Midi", cat: "Saias", cost: 42, sale: 139.9, colors: ["Dourado", "Preto", "Rosé"], sizes: ["P", "M", "G"] },
  { name: "Jaqueta Jeans Oversized", cat: "Jaquetas e Casacos", cost: 89, sale: 279.9, colors: ["Azul Jeans", "Off-white"], sizes: ["P", "M", "G", "GG"] },
  { name: "Camiseta Básica Algodão", cat: "Camisetas", cost: 18, sale: 59.9, colors: ["Branco", "Preto", "Cinza", "Rosa"], sizes: ["PP", "P", "M", "G", "GG"] },
  { name: "Macacão Pantalona", cat: "Macacões", cost: 96, sale: 299.9, colors: ["Preto", "Verde", "Marrom"], sizes: ["P", "M", "G"] },
  { name: "Shorts Jeans Destroyed", cat: "Shorts e Bermudas", cost: 38, sale: 119.9, colors: ["Azul Jeans"], sizes: ["36", "38", "40", "42"] },
  { name: "Body Manga Longa", cat: "Blusas", cost: 32, sale: 109.9, colors: ["Preto", "Off-white", "Vermelho"], sizes: ["P", "M", "G"] },
  { name: "Vestido Longo Festa", cat: "Vestidos", cost: 148, sale: 459.9, colors: ["Preto", "Vermelho", "Dourado"], sizes: ["P", "M", "G"] },
  { name: "Bolsa Tote Couro Sintético", cat: "Acessórios", cost: 55, sale: 179.9, colors: ["Marrom", "Preto", "Bege"], sizes: ["Único"] },
  { name: "Cinto Fino Dourado", cat: "Acessórios", cost: 12, sale: 49.9, colors: ["Dourado", "Preto"], sizes: ["Único"] },
  { name: "Calça Wide Leg Alfaiataria", cat: "Calças", cost: 72, sale: 219.9, colors: ["Off-white", "Preto", "Bege"], sizes: ["36", "38", "40", "42", "44"] },
  { name: "Top Nadador Acetinado", cat: "Blusas", cost: 26, sale: 89.9, colors: ["Rosé", "Preto", "Dourado"], sizes: ["P", "M", "G"] },
];

const CUSTOMERS = [
  "Ana Beatriz Ferreira", "Mariana Souza Lima", "Juliana Almeida", "Patrícia Rodrigues",
  "Fernanda Costa", "Camila Oliveira", "Larissa Martins", "Beatriz Santos",
  "Renata Carvalho", "Vanessa Ribeiro", "Tatiane Nunes", "Carolina Mendes",
  "Aline Barbosa", "Débora Pinto", "Roberta Azevedo", "Sabrina Castro",
  "Letícia Gomes", "Priscila Ramos", "Natália Duarte", "Michele Freitas",
];

async function main() {
  const isDemo = process.argv.includes("--demo");
  if (!isDemo) {
    console.log("Este script cria dados de demonstração. Use: npm run db:demo");
    process.exit(0);
  }

  console.log("\n=== ORION — dados de DEMONSTRAÇÃO ===\n");

  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(products);
  if (Number(existing[0]?.count ?? 0) > 0) {
    console.log("Já existem produtos cadastrados. Abortando para não duplicar dados.");
    console.log("Para recriar a demo, use: npm run db:reset && npm run db:migrate && npm run db:demo\n");
    process.exit(0);
  }

  // ---- usuário vendedor demo ----
  const adminRows = await db.select().from(users).where(sql`role = 'ADMIN'`).limit(1);
  const admin = adminRows[0];
  if (!admin) {
    console.error("Crie o administrador primeiro: npm run admin:create");
    process.exit(1);
  }
  const actor = { id: admin.id, name: admin.name };

  const sellerRows = await db
    .select()
    .from(users)
    .where(sql`lower(email) = 'vendedora@passarela.local'`)
    .limit(1);
  let sellerId = sellerRows[0]?.id ?? admin.id;
  if (!sellerRows[0]) {
    const { hashPassword } = await import("../src/server/auth/password");
    const [created] = await db
      .insert(users)
      .values({
        name: "Camila Vendedora",
        email: "vendedora@passarela.local",
        passwordHash: await hashPassword(`Demo@${random(100000, 999999)}`),
        role: "SELLER",
        isActive: true,
        commissionRate: "3.000",
      })
      .returning();
    sellerId = created.id;
    console.log("Vendedor demo criado: vendedora@passarela.local");
  }

  // ---- fornecedores ----
  const supplierNames = [
    "Confecções Bella Moda Ltda [DEMO]",
    "Ateliê São Paulo Jeans [DEMO]",
    "Distribuidora Estação Moda [DEMO]",
  ];
  const supplierIds: string[] = [];
  for (const name of supplierNames) {
    const [sup] = await db
      .insert(suppliers)
      .values({
        legalName: name,
        tradeName: name.replace(" [DEMO]", ""),
        document: String(random(10000000000000, 99999999999999)),
        city: "São Paulo",
        state: "SP",
        phone: `11${random(30000000, 39999999)}`,
        email: `contato${supplierIds.length + 1}@fornecedor.demo`,
      })
      .returning();
    supplierIds.push(sup.id);
  }
  console.log(`${supplierNames.length} fornecedores de demonstração criados.`);

  // ---- catálogo auxiliar ----
  const colorRows = await db.select().from(colors);
  const sizeRows = await db.select().from(sizes);
  const catRows = await db.select().from(categories);
  const colorByName = new Map(colorRows.map((c) => [c.name, c.id]));
  const sizeByName = new Map(sizeRows.map((s) => [s.name, s.id]));
  const catByName = new Map(catRows.map((c) => [c.name, c.id]));

  const brandIds: string[] = [];
  const { brands } = await import("../src/server/db/schema");
  for (const brandName of ["Ateliê Aurora [DEMO]", "Bella Vita [DEMO]"]) {
    const found = await db.select().from(brands).where(sql`name = ${brandName}`).limit(1);
    if (found[0]) {
      brandIds.push(found[0].id);
      continue;
    }
    const [b] = await db.insert(brands).values({ name: brandName }).returning();
    brandIds.push(b.id);
  }

  // ---- produtos com grade ----
  let createdProducts = 0;
  const productIds: string[] = [];
  for (const p of PRODUCTS) {
    try {
      const result = await createProduct(
        {
          name: `${p.name} ${DEMO}`,
          categoryId: catByName.get(p.cat) ?? null,
          brandId: pick(brandIds),
          supplierId: pick(supplierIds),
          costPrice: p.cost,
          salePrice: p.sale,
          material: "Tecido premium",
          composition: "Poliéster com elastano",
          lowStock: 4,
          grid: {
            colorIds: p.colors.map((c) => colorByName.get(c)).filter(Boolean) as string[],
            sizeIds: p.sizes.map((s) => sizeByName.get(s)).filter(Boolean) as string[],
          },
          notes: "Produto de demonstração criado por npm run db:demo",
        },
        actor,
      );
      // estoque inicial aleatório por variação
      for (const variant of result.variants) {
        const qty = random(0, 14);
        if (qty > 0) {
          await db.execute(sql`
            UPDATE product_variants SET stock_qty = ${qty} WHERE id = ${variant.id}
          `);
          await db.execute(sql`
            INSERT INTO stock_levels (variant_id, warehouse_id, quantity)
            SELECT ${variant.id}, id, ${qty} FROM warehouses WHERE is_default = true
            ON CONFLICT (variant_id, warehouse_id) DO UPDATE SET quantity = ${qty}
          `);
          await db.execute(sql`
            INSERT INTO stock_movements (variant_id, product_id, warehouse_id, type, quantity, balance_after, reason, user_name)
            SELECT ${variant.id}, ${result.product.id}, id, 'OPENING', ${qty}, ${qty},
                   'Estoque inicial (demonstração)', 'Sistema (demo)'
              FROM warehouses WHERE is_default = true
          `);
        }
      }
      productIds.push(result.product.id);
      createdProducts++;
    } catch (err) {
      console.warn(`  falha ao criar ${p.name}:`, (err as Error).message);
    }
  }
  console.log(`${createdProducts} produtos de demonstração criados com grade de cor × tamanho.`);

  // ---- clientes ----
  const customerIds: string[] = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const name = `${CUSTOMERS[i]} ${DEMO}`;
    try {
      const c = await createCustomer(
        {
          name,
          document: generateCpf(),
          phone: `31 9${random(10000000, 99999999)}`,
          whatsapp: `31 9${random(10000000, 99999999)}`,
          email: `cliente${i + 1}@demo.passarela.local`,
          birthDate: `19${random(70, 99)}-${String(random(1, 12)).padStart(2, "0")}-${String(random(1, 28)).padStart(2, "0")}`,
          city: "Ipatinga",
          state: "MG",
          sizePreference: pick(["P", "M", "G", "38", "40"]),
          creditLimit: random(0, 3) === 0 ? 500 : 0,
          acceptsWhatsapp: random(0, 1) === 1,
          lgpdConsent: true,
          lgpdConsentSource: "cadastro-demo",
        },
        actor,
      );
      customerIds.push(c.id);
    } catch {
      /* documento duplicado improvável */
    }
  }
  console.log(`${customerIds.length} clientes de demonstração criados.`);

  // ---- caixa aberto ----
  let sessionId: string | null = null;
  try {
    const session = await openSession({
      userId: sellerId,
      userName: "Camila Vendedora",
      openingAmount: "300.00",
      notes: "Abertura de demonstração",
    });
    sessionId = session.id;
  } catch {
    const rows = await db.execute(sql`SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1`);
    sessionId = (rows.rows as Array<{ id: string }>)[0]?.id ?? null;
  }
  console.log(sessionId ? "Caixa de demonstração aberto." : "Não foi possível abrir o caixa.");

  // ---- vendas históricas (90 dias) ----
  const variantRows = await db.execute(sql`
    SELECT pv.id, pv.sale_price, pv.stock_qty, pv.cost_price
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
     WHERE pv.stock_qty::numeric > 0 AND pv.is_active = true
     ORDER BY random() LIMIT 120
  `);
  const variants = variantRows.rows as Array<{
    id: string;
    sale_price: string;
    stock_qty: string;
    cost_price: string;
  }>;

  let salesCreated = 0;
  const today = todayKey();

  for (let day = 89; day >= 0; day--) {
    const dateKey = addDaysKey(today, -day);
    // volume maior nos fins de semana
    const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
    const salesPerDay = weekday === 0 ? random(0, 2) : random(1, 5);
    for (let s = 0; s < salesPerDay; s++) {
      const itemCount = random(1, 3);
      const chosen = new Set<string>();
      const items: Array<{ variantId: string; quantity: number }> = [];
      for (let i = 0; i < itemCount; i++) {
        const v = pick(variants);
        if (!v || chosen.has(v.id)) continue;
        if (Number(v.stock_qty) < 1) continue;
        chosen.add(v.id);
        items.push({ variantId: v.id, quantity: 1 });
      }
      if (!items.length) continue;

      const withCustomer = random(0, 10) > 2;
      const paymentRoll = random(1, 100);
      const method =
        paymentRoll <= 32 ? "PIX" : paymentRoll <= 52 ? "DEBIT" : paymentRoll <= 72 ? "CREDIT" : paymentRoll <= 88 ? "CASH" : "STORE_CREDIT";
      const installments = method === "STORE_CREDIT" ? random(2, 4) : method === "CREDIT" ? random(1, 3) : 1;

      try {
        const subtotalEstimate = items.reduce((acc, i) => {
          const v = variants.find((x) => x.id === i.variantId)!;
          return acc + Number(v.sale_price) * i.quantity;
        }, 0);

        const result = await createSale(
          {
            customerId: withCustomer || method === "STORE_CREDIT" ? pick(customerIds) : null,
            sellerId,
            items,
            payments: [
              {
                method: method as never,
                amount: money(subtotalEstimate),
                installments,
                tenderedAmount: method === "CASH" ? Math.ceil(subtotalEstimate / 10) * 10 : undefined,
              },
            ],
            notes: "Venda de demonstração",
            originType: withCustomer ? "PDV" : "PDV",
          },
          {
            id: sellerId,
            name: "Camila Vendedora",
            maxDiscountPercent: 100,
            canUnlimitedDiscount: true,
            canNegativeStock: true,
          },
        );
        // Ajusta a data para o histórico (a venda é criada "agora")
        const ts = `${dateKey}T${String(random(9, 19)).padStart(2, "0")}:${String(random(0, 59)).padStart(2, "0")}:00Z`;
        await db.execute(sql`
          UPDATE sales SET created_at = ${ts}::timestamptz, completed_at = ${ts}::timestamptz
          WHERE id = ${result.sale.id}
        `);
        await db.execute(sql`
          UPDATE receivables SET created_at = ${ts}::timestamptz, due_date = (${ts}::timestamptz::date + INTERVAL '30 days')::date
          WHERE sale_id = ${result.sale.id}
        `);
        salesCreated++;
      } catch {
        /* estoque insuficiente: segue */
      }
    }
  }
  console.log(`${salesCreated} vendas de demonstração distribuídas nos últimos 90 dias.`);

  // ---- contas a pagar ----
  const financeCatRows = await db.execute(sql`SELECT id, name FROM finance_categories LIMIT 20`);
  const financeCats = financeCatRows.rows as Array<{ id: string; name: string }>;
  const expenseCat = financeCats.find((c) => c.name === "Aluguel") ?? financeCats[0];

  const payablesData: Array<[string, number, number]> = [
    ["Aluguel da loja (referência do mês) [DEMO]", 3200, 5],
    ["Energia elétrica [DEMO]", 480, 10],
    ["Internet e telefonia [DEMO]", 189, 12],
    ["Folha de pagamento [DEMO]", 5400, 5],
    ["Marketing em redes sociais [DEMO]", 650, 15],
    ["Compra de mercadorias — Confecções Bella Moda [DEMO]", 2400, -3],
    ["Simples Nacional [DEMO]", 890, 20],
  ];
  for (const [description, amount, dayOffset] of payablesData) {
    await createPayable({
      description,
      amount: String(amount),
      dueDate: addDaysKey(today, dayOffset),
      categoryId: expenseCat?.id ?? null,
      supplierId: supplierIds[0],
      actor,
    });
  }
  console.log(`${payablesData.length} contas a pagar de demonstração criadas.`);

  await db.execute(sql`
    INSERT INTO audit_logs (user_id, user_name, action, entity, description)
    VALUES (${admin.id}, ${admin.name}, 'SEED_DEMO', 'system',
            'Dados de demonstração carregados via npm run db:demo. Remova antes de usar em produção.')
  `);

  console.log("\n=== Demonstração pronta ===");
  console.log("Acesse o sistema com o usuário administrador criado por npm run admin:create.");
  console.log("Todos os registros de demonstração contêm o sufixo [DEMO].\n");

  await getPool().end();
  process.exit(0);
}

/** Gera CPF válido aleatório (apenas para dados fictícios de demonstração). */
function generateCpf(): string {
  const digits = Array.from({ length: 9 }, () => random(0, 9));
  for (let t = 0; t < 2; t++) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += digits[i] * (digits.length + 1 - i);
    const d = (sum * 10) % 11;
    digits.push(d === 10 ? 0 : d);
  }
  return digits.join("");
}

main().catch(async (err) => {
  console.error("Falha ao gerar demonstração:", err);
  await getPool().end().catch(() => undefined);
  process.exit(1);
});
