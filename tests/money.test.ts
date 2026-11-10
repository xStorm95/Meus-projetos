import { describe, expect, it } from "vitest";
import { d, isValidMoney, money, parseBRNumber, qty } from "../src/server/lib/money";

/**
 * Regressão: campos de dinheiro digitados no padrão brasileiro ("99,90")
 * derrubavam a criação de produto com 500 (erro interno).
 * Aqui garantimos que a conversão entende o que a pessoa digita e que valor
 * inválido nunca lança exceção.
 */
describe("dinheiro — entrada digitada pelo usuário", () => {
  const casos: Array<[string, string]> = [
    ["99,90", "99.90"],
    ["99.90", "99.90"],
    ["1.234,56", "1234.56"],
    ["R$ 1.234,56", "1234.56"],
    ["1234", "1234.00"],
    ["1,5", "1.50"],
    ["0,05", "0.05"],
    ["1.234.567", "1234567.00"],
    ["-10,50", "-10.50"],
    ["", "0.00"],
  ];

  for (const [entrada, esperado] of casos) {
    it(`converte "${entrada}" em ${esperado}`, () => {
      expect(money(entrada)).toBe(esperado);
    });
  }

  it("nunca lança exceção com entrada inválida", () => {
    expect(() => d("abc")).not.toThrow();
    expect(() => d("!!!///")).not.toThrow();
    expect(() => d(null)).not.toThrow();
    expect(() => d(undefined)).not.toThrow();
    expect(() => d(NaN)).not.toThrow();
    expect(money("abc")).toBe("0.00");
  });

  it("identifica valor realmente inválido para avisar o usuário", () => {
    expect(isValidMoney("99,90")).toBe(true);
    expect(isValidMoney("")).toBe(true);
    expect(isValidMoney("abc")).toBe(false);
    expect(isValidMoney("12,34,56")).toBe(false);
  });

  it("preserva precisão de centavos (sem erro de ponto flutuante)", () => {
    expect(money(d("0.10").plus(d("0.20")))).toBe("0.30");
    expect(money("10,005")).toBe("10.01");
  });

  it("quantidade aceita 3 casas decimais", () => {
    expect(qty("1,5").toFixed(3)).toBe("1.500");
    expect(qty("2,250").toFixed(3)).toBe("2.250");
  });

  it("parseBRNumber devolve null quando não há número", () => {
    expect(parseBRNumber("abc")).toBeNull();
    expect(parseBRNumber("")).toBeNull();
  });
});
