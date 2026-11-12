/**
 * Regra da curva ABC (Pareto) — a única parte do painel que é lógica pura.
 *
 * Decisões que estes testes travam:
 *  - o item que CRUZA os 80% ainda é A (se ele caisse em B, uma loja com um
 *    campeão isolado veria a classe A vazia);
 *  - item com receita zero/negativa não entra (devolução não é "C");
 *  - as três classes somam 100% da receita considerada.
 */
import { describe, expect, it } from "vitest";
import { montarCurva } from "../src/server/services/dashboard";

const item = (nome: string, receita: number) => ({
  nome,
  detalhe: "",
  quantidade: 1,
  receita,
  lucro: receita / 2,
});

describe("montarCurva (curva ABC)", () => {
  it("classifica por acumulado com o item que cruza os 80% ainda em A", () => {
    // 500 de 565 = 88,5% → o primeiro item já passa de 80%, mas é A.
    const curva = montarCurva([item("Campeão", 500), item("Médio", 60), item("Barato", 5)]);
    expect(curva.itens.map((i) => i.classe)).toEqual(["A", "B", "C"]);
    expect(curva.classeA.itens).toBe(1);
    expect(curva.classeA.share).toBeGreaterThan(80);
  });

  it("distribui em A/B/C e as classes somam 100%", () => {
    // 10 itens iguais (10% cada): A vai até o item que começa em 80% — ele
    // ainda é A, porque é ele quem cruza a linha dos 80%.
    const curva = montarCurva(Array.from({ length: 10 }, (_, i) => item(`P${i}`, 100)));
    expect(curva.classeA.itens).toBe(9);
    expect(curva.classeB.itens).toBe(1);
    expect(curva.classeC.itens).toBe(0);
    expect(curva.classeA.share + curva.classeB.share + curva.classeC.share).toBeCloseTo(100, 6);
  });

  it("nenhum item com receita positiva fica fora das três classes", () => {
    const receitas = [1000, 400, 250, 120, 90, 60, 40, 30, 20, 15, 8, 5, 3, 2, 1];
    const curva = montarCurva(receitas.map((r, i) => item(`P${i}`, r)));
    expect(curva.itens.length).toBe(receitas.length);
    expect(curva.itens.every((i) => ["A", "B", "C"].includes(i.classe))).toBe(true);
    // A nunca é vazia quando existe receita
    expect(curva.classeA.itens).toBeGreaterThan(0);
  });

  it("ignora receita zero ou negativa", () => {
    const curva = montarCurva([item("Ok", 100), item("Devolvido", 0), item("Negativo", -50)]);
    expect(curva.itens).toHaveLength(1);
    expect(curva.receitaTotal).toBe(100);
  });

  it("acumulado é crescente e termina em 100%", () => {
    const curva = montarCurva([item("A", 40), item("B", 30), item("C", 30)]);
    expect(curva.itens[0].acumulado).toBeCloseTo(40, 6);
    expect(curva.itens.at(-1)!.acumulado).toBeCloseTo(100, 6);
  });

  it("sem itens não divide por zero", () => {
    const curva = montarCurva([]);
    expect(curva.itens).toEqual([]);
    expect(curva.receitaTotal).toBe(0);
    expect(curva.classeA.share).toBe(0);
  });
});
