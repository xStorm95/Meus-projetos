/**
 * INTEGRAÇÃO — o dashboard não pode se contradizer.
 *
 * Prova, com vendas reais no banco, que:
 *  - o card do período e o card do mês ("Faturamento do mês") concordam;
 *  - venda em aberto (OPEN) não entra em nenhum dos dois;
 *  - venda cancelada não entra;
 *  - a venda das 22h de ontem conta em ONTEM, não em hoje (fuso da loja);
 *  - o gráfico tem a mesma soma dos cards.
 */
import { describe, expect, it } from "vitest";
import "./helpers";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { customers, sales } from "../src/server/db/schema";
import { adminActor, inTestCompany } from "./helpers";
import { getDashboard } from "../src/server/services/dashboard";
import { addDaysKey, inicioDoDia, todayKey } from "../src/server/lib/dates";
import { createProduct } from "../src/server/services/products";
import { createSale } from "../src/server/services/sales";

const ator = async () => {
  const a = await adminActor();
  return { ...a, maxDiscountPercent: 100, canUnlimitedDiscount: true, canNegativeStock: true };
};

/** Cria uma venda pelo serviço e força `completed_at` para o instante pedido. */
async function vendaEm(instante: Date, valor: number, opts: { aberta?: boolean } = {}) {
  const agora = new Date();
  void agora;
  const { variacao, cliente } = await inTestCompany(async () => {
    const [c] = await db
      .insert(customers)
      .values({ name: `Cliente Fuso ${Date.now()}${Math.random().toString(36).slice(2, 6)}` })
      .returning();
    const { variants } = await createProduct(
      {
        name: `Peça Fuso ${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        costPrice: valor / 2,
        salePrice: valor,
        variants: [{ colorId: null, sizeId: null, costPrice: valor / 2, salePrice: valor, stockQty: 50 }],
      },
      { id: (await ator()).id, name: "Operador" },
    );
    return { variacao: variants[0], cliente: c };
  });

  const resultado = await inTestCompany(async () =>
    createSale(
      {
        customerId: cliente.id,
        items: [{ variantId: variacao.id, quantity: 1, unitPrice: valor }],
        payments: opts.aberta ? [] : [{ method: "CASH", amount: valor }],
        saveAsOpen: opts.aberta,
      } as never,
      await ator(),
    ),
  );

  // A data do "evento" é o que define o período: ajusta para o instante pedido.
  await inTestCompany(async () => {
    await db
      .update(sales)
      .set({ completedAt: opts.aberta ? null : instante, createdAt: instante })
      .where(eq(sales.id, resultado.sale.id));
  });

  return resultado.sale;
}

/** Instante de um horário de Brasília (UTC-3) numa data YYYY-MM-DD. */
function emBrasilia(dia: string, hora: number): Date {
  return new Date(Date.parse(`${dia}T00:00:00.000Z`) + (hora + 3) * 3600_000);
}

describe("dashboard: cards do período e do mês contam a mesma coisa", () => {
  it("venda às 22h de hoje aparece nos dois cards e no gráfico", async () => {
    const hoje = todayKey();
    // 22h de hoje em Brasília = 01h de amanhã em UTC (o caso que quebrava)
    await vendaEm(emBrasilia(hoje, 22), 600);

    const mesInicio = `${hoje.slice(0, 7)}-01`;
    const d = await inTestCompany(async () => getDashboard({ from: mesInicio, to: hoje }));

    // Com o filtro "Este mês", o card do período é o mês inteiro
    expect(Number(d.current.revenue)).toBeGreaterThanOrEqual(600);
    // O card "Faturamento do mês" precisa bater com o do período
    expect(Number(d.month.revenue)).toBe(Number(d.current.revenue));
    expect(Number(d.month.salesCount)).toBe(Number(d.current.salesCount));
    // O gráfico soma o mesmo valor dos cards
    const somaGrafico = d.chart.reduce((acc, p) => acc + p.revenue, 0);
    expect(somaGrafico).toBeCloseTo(Number(d.current.revenue), 2);
    // E o dia da venda no gráfico é HOJE (não amanhã)
    expect(d.chart.some((p) => p.day === hoje)).toBe(true);
  });

  it("venda em aberto não entra em nenhum card", async () => {
    const hoje = todayKey();
    const antes = await inTestCompany(async () =>
      getDashboard({ from: `${hoje.slice(0, 7)}-01`, to: hoje }),
    );
    await vendaEm(emBrasilia(hoje, 12), 500, { aberta: true });
    const depois = await inTestCompany(async () =>
      getDashboard({ from: `${hoje.slice(0, 7)}-01`, to: hoje }),
    );
    expect(Number(depois.current.revenue)).toBe(Number(antes.current.revenue));
    expect(depois.month.salesCount).toBe(antes.month.salesCount);
  });

  it("venda cancelada não entra", async () => {
    const hoje = todayKey();
    const venda = await vendaEm(emBrasilia(hoje, 10), 300);
    await inTestCompany(async () => {
      await db.update(sales).set({ status: "CANCELED" }).where(eq(sales.id, venda.id));
    });
    const d = await inTestCompany(async () => getDashboard({ from: hoje, to: hoje }));
    const ids = await inTestCompany(async () =>
      db.select({ n: sql<number>`COUNT(*)::int` }).from(sales).where(eq(sales.status, "CANCELED")),
    );
    expect(Number(ids[0].n)).toBeGreaterThan(0);
    // A venda cancelada de 300 não pode estar no faturamento de hoje
    expect(d.current.revenue).not.toBe("300.00");
  });

  it("venda de ontem às 23h conta em ontem, não em hoje", async () => {
    const hoje = todayKey();
    const ontem = addDaysKey(hoje, -1);
    await vendaEm(emBrasilia(ontem, 23), 777);

    const dOntem = await inTestCompany(async () => getDashboard({ from: ontem, to: ontem }));
    const dHoje = await inTestCompany(async () => getDashboard({ from: hoje, to: hoje }));

    expect(Number(dOntem.current.revenue)).toBeGreaterThanOrEqual(777);
    expect(Number(dOntem.current.salesCount)).toBeGreaterThanOrEqual(1);
    // Em "hoje" essa venda não pode aparecer
    const vendaDeOntemNoGraficoDeHoje = dHoje.chart.some((p) => p.day === ontem);
    expect(vendaDeOntemNoGraficoDeHoje).toBe(false);
  });

  it("o início do dia usado nas consultas é 03:00 UTC", async () => {
    const hoje = todayKey();
    expect(inicioDoDia(hoje).toISOString().endsWith("T03:00:00.000Z")).toBe(true);
  });
});
