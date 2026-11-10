import { describe, expect, it } from "vitest";
import "./helpers";

/**
 * MULTI-LOJA — o teste que importa.
 *
 * Cria duas lojas com dados parecidos e prova que:
 *  - cada loja só enxerga os próprios dados (leitura);
 *  - gravação sempre cai na loja certa;
 *  - não dá para editar/apagar registro de outra loja;
 *  - sem loja no contexto, não vaza nada.
 */
import { db } from "../src/server/db/client";
import { companies, customers, products, sales, users } from "../src/server/db/schema";
import { runAsSystem, withCompany } from "../src/server/db/tenant";
import { guardQueryForTests } from "../src/server/db/client";
import { eq } from "drizzle-orm";

async function criarLoja(nome: string) {
  return runAsSystem(async () => {
    const [company] = await db
      .insert(companies)
      .values({ name: nome, slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        companyId: company.id,
        name: `Dono ${nome}`,
        email: `${company.slug}@teste.com`,
        passwordHash: "x".repeat(64),
        role: "ADMIN",
      })
      .returning();
    return { company, user };
  });
}

describe("isolamento entre lojas", () => {
  it("cada loja enxerga apenas os próprios produtos", async () => {
    const lojaA = await criarLoja("Loja Alfa");
    const lojaB = await criarLoja("Loja Beta");

    await withCompany(lojaA.company.id, async () => {
      await db.insert(products).values({ name: "Vestido da Alfa", reference: "ALFA-1", costPrice: "10", salePrice: "100" });
    });
    await withCompany(lojaB.company.id, async () => {
      await db.insert(products).values({ name: "Vestido da Beta", reference: "BETA-1", costPrice: "20", salePrice: "200" });
    });

    const vistosPorA = await withCompany(lojaA.company.id, async () => db.select().from(products));
    const vistosPorB = await withCompany(lojaB.company.id, async () => db.select().from(products));

    expect(vistosPorA.map((p) => p.name)).toEqual(["Vestido da Alfa"]);
    expect(vistosPorB.map((p) => p.name)).toEqual(["Vestido da Beta"]);
  });

  it("cliente e venda de uma loja não aparecem na outra", async () => {
    const lojaA = await criarLoja("Loja Gama");
    const lojaB = await criarLoja("Loja Delta");

    await withCompany(lojaA.company.id, async () => {
      await db.insert(customers).values({ name: "Cliente da Gama", phone: "33999990000" });
    });

    const clientesB = await withCompany(lojaB.company.id, async () => db.select().from(customers));
    expect(clientesB).toHaveLength(0);
  });

  it("não é possível editar registro de outra loja", async () => {
    const lojaA = await criarLoja("Loja Epsilon");
    const lojaB = await criarLoja("Loja Zeta");

    const [produtoA] = await withCompany(lojaA.company.id, async () =>
      db.insert(products).values({ name: "Produto Epsilon", reference: "EPS-1", costPrice: "5", salePrice: "50" }).returning(),
    );

    // Loja B tenta alterar o produto da loja A pelo id
    const alterados = await withCompany(lojaB.company.id, async () =>
      db.update(products).set({ name: "INVADIDO" }).where(eq(products.id, produtoA.id)).returning(),
    );
    expect(alterados).toHaveLength(0);

    // O produto da loja A continua intacto
    const conferido = await withCompany(lojaA.company.id, async () =>
      db.select().from(products).where(eq(products.id, produtoA.id)),
    );
    expect(conferido[0]?.name).toBe("Produto Epsilon");
  });

  it("não é possível apagar registro de outra loja", async () => {
    const lojaA = await criarLoja("Loja Eta");
    const lojaB = await criarLoja("Loja Teta");

    const [produto] = await withCompany(lojaA.company.id, async () =>
      db.insert(products).values({ name: "Não apague", reference: "NAO-1", costPrice: "1", salePrice: "2" }).returning(),
    );

    await withCompany(lojaB.company.id, async () =>
      db.delete(products).where(eq(products.id, produto.id)),
    );

    const aindaExiste = await withCompany(lojaA.company.id, async () =>
      db.select().from(products).where(eq(products.id, produto.id)),
    );
    expect(aindaExiste).toHaveLength(1);
  });

  it("gravação sem loja no contexto é bloqueada", () => {
    // Fora dos testes não existe loja padrão: é este o cenário de produção
    // (VITEST_TEST_COMPANY_ID só é lida fora de produção, ver tenant.ts).
    const salvo = process.env.VITEST_TEST_COMPANY_ID;
    delete process.env.VITEST_TEST_COMPANY_ID;
    try {
      expect(() =>
        guardQueryForTests({ sql: 'insert into "products" ("name") values ($1)', params: ["Sem dono"] }, null),
      ).toThrow(/loja no contexto/i);
    } finally {
      if (salvo !== undefined) process.env.VITEST_TEST_COMPANY_ID = salvo;
    }
  });

  it("leitura sem loja no contexto não devolve dados de ninguém", async () => {
    const lojaA = await criarLoja("Loja Iota");
    await withCompany(lojaA.company.id, async () =>
      db.insert(products).values({ name: "Existe", reference: "EXI-1", costPrice: "1", salePrice: "1" }),
    );

    const salvo = process.env.VITEST_TEST_COMPANY_ID;
    delete process.env.VITEST_TEST_COMPANY_ID;
    try {
      const semContexto = await db.select().from(products);
      expect(semContexto).toHaveLength(0);
    } finally {
      if (salvo !== undefined) process.env.VITEST_TEST_COMPANY_ID = salvo;
    }
  });

  it("venda de uma loja não infla o total da outra", async () => {
    const lojaA = await criarLoja("Loja Kappa");
    const lojaB = await criarLoja("Loja Lambda");

    await withCompany(lojaA.company.id, async () => {
      const [venda] = await db
        .insert(sales)
        .values({
          number: 1,
          status: "COMPLETED",
          subtotal: "100.00",
          discountAmount: "0",
          total: "100.00",
        })
        .returning();
      expect(venda.companyId).toBe(lojaA.company.id);
    });

    const vendasB = await withCompany(lojaB.company.id, async () => db.select().from(sales));
    expect(vendasB).toHaveLength(0);
  });
});
