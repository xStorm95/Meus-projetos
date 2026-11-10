/**
 * Crediário da loja.
 *
 * Bug encontrado no teste de fluxo (HTTP): o PDV oferecia "Crediário", o
 * campo `creditLimit` era gravado na ficha do cliente, mas TODA venda no
 * crediário falhava com "Saldo de crédito insuficiente" — porque o servidor
 * comparava o valor com crédito de TROCA (customer_credits), que é outra
 * coisa, e nunca olhava o limite do cliente.
 *
 * Estes testes garantem que o limite existe, é usado, e que a dívida em
 * aberto reduz o disponível.
 */
import { describe, expect, it } from "vitest";
import "./helpers";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { customers, receivables } from "../src/server/db/schema";
import { createSale } from "../src/server/services/sales";
import { createProduct } from "../src/server/services/products";
import { adminActor, inTestCompany } from "./helpers";

async function ator() {
  const a = await adminActor();
  return { ...a, maxDiscountPercent: 100, canUnlimitedDiscount: true, canNegativeStock: true };
}

/** Cria cliente + produto com 1 variação e devolve o id da variação. */
async function preparar(limite: string) {
  return inTestCompany(async () => {
    const [cliente] = await db
      .insert(customers)
      .values({ name: `Cliente ${limite} ${Date.now()}`, creditLimit: limite })
      .returning();

    const { product, variants } = await createProduct(
      {
        name: `Vestido ${Date.now()}`,
        costPrice: 50,
        salePrice: 250,
        variants: [{ colorId: null, sizeId: null, costPrice: 50, salePrice: 250, stockQty: 20 }],
      },
      { id: (await ator()).id, name: (await ator()).name },
    );

    return { cliente, produto: product, variacao: variants[0] };
  });
}

describe("crediário: limite do cliente é usado de verdade", () => {
  it("venda no crediário passa quando o limite cobre o valor", async () => {
    const { cliente, variacao } = await preparar("500.00");

    const venda = await inTestCompany(async () =>
      createSale(
        {
          customerId: cliente.id,
          items: [{ variantId: variacao.id, quantity: 1, unitPrice: 250 }],
          payments: [{ method: "STORE_CREDIT", amount: 250, installments: 2, firstDueDate: "2026-12-10" }],
        },
        await ator(),
      ),
    );

    expect(venda.sale.total).toBe("250.00");

    const parcelas = await inTestCompany(async () =>
      db.select().from(receivables).where(eq(receivables.customerId, cliente.id)),
    );
    expect(parcelas).toHaveLength(2);
    // 250 em 2x = 125 + 125 (centavos distribuídos corretamente)
    expect(parcelas.map((p) => p.amount).sort()).toEqual(["125.00", "125.00"]);
  });

  it("recusa quando o limite é menor, explicando limite e disponível", async () => {
    const { cliente, variacao } = await preparar("100.00");

    await expect(
      inTestCompany(async () =>
        createSale(
          {
            customerId: cliente.id,
            items: [{ variantId: variacao.id, quantity: 1, unitPrice: 250 }],
            payments: [{ method: "STORE_CREDIT", amount: 250, installments: 1 }],
          },
          await ator(),
        ),
      ),
    ).rejects.toThrow(/Limite de crédito insuficiente/);
  });

  it("dívida em aberto reduz o limite disponível", async () => {
    const { cliente, variacao } = await preparar("300.00");

    // Primeira compra de 250 consome quase todo o limite
    await inTestCompany(async () =>
      createSale(
        {
          customerId: cliente.id,
          items: [{ variantId: variacao.id, quantity: 1, unitPrice: 250 }],
          payments: [{ method: "STORE_CREDIT", amount: 250, installments: 1 }],
        },
        await ator(),
      ),
    );

    // Sobraram 50 de limite: uma compra de 250 precisa ser recusada
    await expect(
      inTestCompany(async () =>
        createSale(
          {
            customerId: cliente.id,
            items: [{ variantId: variacao.id, quantity: 1, unitPrice: 250 }],
            payments: [{ method: "STORE_CREDIT", amount: 250, installments: 1 }],
          },
          await ator(),
        ),
      ),
    ).rejects.toThrow(/Limite de crédito insuficiente/);
  });

  it("venda à vista não é afetada pelo limite", async () => {
    const { cliente, variacao } = await preparar("0.00");

    const venda = await inTestCompany(async () =>
      createSale(
        {
          customerId: cliente.id,
          items: [{ variantId: variacao.id, quantity: 1, unitPrice: 250 }],
          payments: [{ method: "CASH", amount: 250 }],
        },
        await ator(),
      ),
    );
    expect(venda.sale.total).toBe("250.00");
  });
});
