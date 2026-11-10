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

/**
 * Regressão: alias de coluna igual ao nome de outra tabela.
 *
 * `COUNT(DISTINCT si.sale_id) AS sales ... JOIN sales s` fazia o guardião casar
 * o `sales` do SELECT e capturar o "FROM" como alias, gerando
 * `and FROM."company_id" = $1` — erro de sintaxe 42601 que derrubava o
 * relatório "Produtos mais vendidos" com 500.
 */
describe("guardião: alias não pode ser capturado fora do FROM/JOIN", () => {
  const COMPANY = "11111111-1111-1111-1111-111111111111";
  const guardado = (sql: string, params: unknown[] = []) =>
    guardQueryForTests({ sql, params }, COMPANY)?.sql ?? "";

  it("não gera FROM como alias quando uma coluna tem alias igual a outra tabela", () => {
    const sql = guardado(
      `SELECT si.description AS "produto", COUNT(DISTINCT si.sale_id)::int AS sales
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'COMPLETED'
        GROUP BY si.description`,
    );
    expect(sql).not.toMatch(/FROM\."company_id"/);
    expect(sql).toContain('si."company_id"');
    expect(sql).toContain('s."company_id"');
  });

  it("continua filtrando tabela sem alias", () => {
    const sql = guardado("SELECT description, total FROM sale_items WHERE total > 0");
    expect(sql).toContain('sale_items."company_id"');
  });

  it("continua filtrando tabela com alias simples", () => {
    const sql = guardado("SELECT s.id FROM sales s WHERE s.status = 'COMPLETED'");
    expect(sql).toContain('s."company_id"');
  });

  /**
   * Regressão: duas subconsultas da MESMA tabela com aliases diferentes.
   *
   * `COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv ...))
   *  ... EXISTS (SELECT 1 FROM product_variants pv3 ...)`
   * recebia `pv."company_id"` nas duas e a busca de produtos estourava com
   * "missing FROM-clause entry for table pv" (500 em /api/products?search=).
   */
  it("cada subconsulta usa o próprio alias da tabela", () => {
    const sql = guardado(
      `select "products"."id", COALESCE((SELECT SUM(pv.stock_qty) FROM product_variants pv ` +
        `WHERE pv.product_id = "products"."id"), 0)::text from "products" ` +
        `where EXISTS (SELECT 1 FROM product_variants pv3 WHERE pv3.product_id = "products"."id")`,
    );
    expect(sql).toContain('pv."company_id"');
    expect(sql).toContain('pv3."company_id"');
    // O alias de uma subconsulta nunca pode aparecer na outra
    expect(sql).not.toMatch(/pv3\.product_id[^)]*pv\."company_id"/);
    expect(sql).toContain('"products"."company_id"');
  });

  /**
   * Regressão: nome de coluna que CONTÉM o nome de uma tabela.
   *
   * `COALESCE((SELECT SUM(p.amount) FROM payables p ...)) AS open_payables`
   * fazia o guardião achar que `payables` estava no nível principal (porque
   * "open_payables" contém "payables") e escrever `where p."company_id"` no
   * WHERE externo — "missing FROM-clause entry for table p" (500 no
   * relatório "Compras por fornecedor").
   */
  it("não confunde nome de coluna com nome de tabela", () => {
    const sql = guardado(
      `SELECT s.id, COALESCE((SELECT SUM(p.amount) FROM payables p WHERE p.supplier_id = s.id), 0)::text AS open_payables ` +
        `FROM suppliers s`,
    );
    expect(sql).toContain('p."company_id"');
    expect(sql).toContain('s."company_id"');
    // A condição de `p` precisa estar DENTRO da subconsulta (antes do FROM externo)
    const ondeSubconsultaFecha = sql.lastIndexOf(")");
    const antesDoFromExterno = sql.slice(0, sql.lastIndexOf("FROM suppliers"));
    expect(antesDoFromExterno).toContain('p."company_id"');
    expect(sql.slice(sql.lastIndexOf("FROM suppliers"))).not.toContain('p."company_id"');
    expect(ondeSubconsultaFecha).toBeGreaterThan(0);
  });

  it("subconsulta correlacionada mantém o próprio alias", () => {
    const sql = guardado(
      `select (select count(*) from sale_items si where si.sale_id = "sales"."id") from "sales"`,
    );
    expect(sql).toContain('si."company_id"');
    expect(sql).toContain('"sales"."company_id"');
  });

  it("continua filtrando tabela citada com aspas (SQL do Drizzle)", () => {
    const sql = guardado('select "products"."id" from "products" where "products"."deleted_at" is null');
    expect(sql).toContain('"company_id"');
  });

  it("coluna chamada igual à tabela não vira alias", () => {
    // `sales` como nome de coluna no SELECT, sem alias nenhum.
    const sql = guardado("SELECT sales, id FROM sales WHERE id = $1", ["x"]);
    expect(sql).not.toMatch(/FROM\."company_id"/);
    expect(sql).toContain('sales."company_id"');
  });
});
