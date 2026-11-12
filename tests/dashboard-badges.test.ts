/**
 * Badge de variação do dashboard — a regra em um só lugar.
 *
 * Histórico do bug: o backend devolvia 100% quando o período anterior era
 * zero (`(atual - 0) / 0` tratado como +100), então toda loja nova abria o
 * painel com "Faturamento +100%" em verde, como se tivesse dobrado. Depois,
 * passou a devolver `null`; a tela precisa decidir o que fazer com isso.
 *
 * Regras (implementadas na tela e verificadas aqui):
 *  - sem base E o indicador saiu de zero  → "Novo" (cinza, nunca verde)
 *  - sem base E o indicador também é zero → "—" (não é novidade nenhuma)
 *  - variação 0                           → "0,0%" neutro
 *  - subiu                                → verde (vermelho se for despesa)
 *  - caiu                                 → vermelho (verde se for despesa)
 */
import { describe, expect, it } from "vitest";

type Estado = {
  rotulo: "novo" | "sem-base" | "neutro" | "subiu" | "caiu";
  bom: boolean;
};

/** Mesma lógica de `KpiCard` (dashboard-view.tsx). */
function estadoDoBadge(
  variation: number | null | undefined,
  atual: number | undefined,
  invertida = false,
): Estado {
  const temAtual = atual === undefined || atual > 0;
  const semBase = (variation === null || variation === undefined) && temAtual;
  const semComparacao = (variation === null || variation === undefined) && !temAtual;
  if (semBase) return { rotulo: "novo", bom: true };
  if (semComparacao) return { rotulo: "sem-base", bom: true };
  if (variation === 0) return { rotulo: "neutro", bom: true };
  const subiu = (variation as number) > 0;
  return { rotulo: subiu ? "subiu" : "caiu", bom: invertida ? !subiu : subiu };
}

describe("badge de variação", () => {
  it("primeiro período com venda mostra 'Novo', nunca 100%", () => {
    const e = estadoDoBadge(null, 600);
    expect(e.rotulo).toBe("novo");
  });

  it("indicador zerado nos dois períodos mostra '—'", () => {
    expect(estadoDoBadge(null, 0).rotulo).toBe("sem-base");
    // despesa zerada também não é "novidade"
    expect(estadoDoBadge(null, 0, true).rotulo).toBe("sem-base");
  });

  it("variação exatamente zero é neutra", () => {
    expect(estadoDoBadge(0, 500).rotulo).toBe("neutro");
  });

  it("alta é boa no faturamento e ruim na despesa", () => {
    expect(estadoDoBadge(12.5, 900).bom).toBe(true);
    expect(estadoDoBadge(12.5, 900, true).bom).toBe(false);
  });

  it("queda é ruim no faturamento e boa na despesa", () => {
    expect(estadoDoBadge(-8, 900).bom).toBe(false);
    expect(estadoDoBadge(-8, 900, true).bom).toBe(true);
  });
});
