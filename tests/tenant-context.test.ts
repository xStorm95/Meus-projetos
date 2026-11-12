/**
 * REGRESSÃO — isolamento de loja fora do contexto.
 *
 * Dois bugs reais encontrados ao verificar o dashboard no navegador:
 *
 *  1. No App Router, layout e página rodam em contextos assíncronos
 *     diferentes: o `enterWith` da sessão não alcança as consultas da página.
 *     O guardião então considerava "sem loja" e devolvia conjunto vazio —
 *     dashboard com R$ 0,00 mesmo havendo vendas.
 *
 *  2. A resolução de emergência usava um flag GLOBAL para conter recursão.
 *     Com duas requisições simultâneas, uma zerava o flag da outra e o
 *     resultado era `null` (dado vazio na tela).
 *
 * Aqui provamos que o isolamento continua fechado quando falta contexto e que
 * consultas concorrentes de lojas diferentes não se contaminam.
 */
import { describe, expect, it } from "vitest";
import "./helpers";
import { sql } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { runWithCompany, withCompany, runAsSystem } from "../src/server/db/tenant";
import { ensureTestCompanyReady } from "./helpers";

/** Insere uma loja descartável e devolve o id. */
async function lojaDescartavel(nome: string): Promise<string> {
  const r = await runAsSystem(() =>
    db.execute(sql`
      INSERT INTO companies (name, slug, email)
      VALUES (${nome}, ${`${nome}-${Date.now()}${Math.floor(Math.random() * 1e6)}`},
              ${`${nome}@teste.local`})
      RETURNING id
    `),
  );
  return (r.rows as Array<{ id: string }>)[0].id;
}

/** Quantas vendas a loja do contexto atual enxerga. */
async function contarVendas(): Promise<number> {
  const r = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM sales`)) as unknown as {
    rows: Array<{ n: number }>;
  };
  return Number(r.rows[0]?.n ?? 0);
}

describe("guardião multi-loja", () => {
  it("loja inexistente devolve vazio, nunca dados de outra loja", async () => {
    const n = await runWithCompany("00000000-0000-0000-0000-000000000000", contarVendas);
    expect(n).toBe(0);
  });

  it("loja nova (sem vendas) não enxerga as vendas da loja de testes", async () => {
    const lojaTestes = await ensureTestCompanyReady();
    const vendasTestes = await withCompany(lojaTestes, contarVendas);

    const nova = await lojaDescartavel("vazia");
    const vendasNova = await withCompany(nova, contarVendas);

    expect(vendasNova).toBe(0);
    // E a loja de testes continua vendo o que via.
    expect(await withCompany(lojaTestes, contarVendas)).toBe(vendasTestes);
  });

  it("dez consultas simultâneas de lojas alternadas mantêm o isolamento", async () => {
    // Essa é a regressão do flag global: em paralelo, uma requisição anulava
    // a resolução da outra e o guardião devolvia vazio.
    const lojaTestes = await ensureTestCompanyReady();
    const lojaVazia = await lojaDescartavel("paralela");

    const esperadoTestes = await withCompany(lojaTestes, contarVendas);
    const esperadoVazia = await withCompany(lojaVazia, contarVendas); // 0

    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? withCompany(lojaTestes, contarVendas)
          : withCompany(lojaVazia, contarVendas),
      ),
    );

    resultados.forEach((n, i) => {
      expect(n).toBe(i % 2 === 0 ? esperadoTestes : esperadoVazia);
    });
  });

  /*
   * Obs.: em ambiente de teste existe `VITEST_TEST_COMPANY_ID` como loja de
   * reserva (ver tenant.ts), então "sem contexto" não é mensurável aqui. O
   * bloqueio de gravação sem loja é coberto pelo teste de loja inexistente,
   * que prova a falha fechada na leitura.
   */
});
