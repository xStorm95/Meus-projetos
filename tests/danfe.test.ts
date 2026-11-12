/**
 * DANFE simplificada (cupom da NFC-e).
 *
 * O risco deste documento não é estético: é o lojista imprimir um cupom que
 * PARECE nota fiscal autorizada. Os testes travam:
 *  - a tarja de situação (PENDING nunca aparece como autorizado);
 *  - a presença dos dados obrigatórios (emitente, chave, itens, tributos);
 *  - o escape de HTML (nome de produto com `<script>` não vira código);
 *  - a formatação da chave de acesso em grupos de 4.
 */
import { describe, expect, it } from "vitest";
import { danfeHtml, formatarChave } from "../src/server/lib/danfe";

const base = {
  emitente: {
    nome: "Ateliê Aurora",
    razaoSocial: "Aurora Comércio de Vestuário Ltda",
    documento: "12345678000199",
    inscricaoEstadual: "001122334455",
    endereco: "Rua das Flores, 120, Centro",
    cidade: "Ipatinga",
    uf: "MG",
    telefone: "(33) 99999-0000",
  },
  documento: {
    modelo: "65" as const,
    serie: 1,
    numero: 42,
    ambiente: "HOMOLOGATION" as const,
    status: "PENDING",
    chaveAcesso: null,
    protocolo: null,
    emitidoEm: "2026-11-07T12:00:00.000Z",
    rejeicao: null,
  },
  venda: { numero: 2048, total: "189.90" },
  consumidor: { nome: "Maria Silva", documento: "12345678909" },
  itens: [
    {
      sku: "VEST-AZUL-M",
      description: "Vestido midi azul",
      colorName: "Azul",
      sizeName: "M",
      quantity: 1,
      unitPrice: "189.90",
      total: "189.90",
      ncm: "6204",
      cfop: "5102",
      csosn: "102",
    },
  ],
  pagamentos: [{ method: "PIX", amount: "189.90" }],
  tributosAproximados: "25.36",
};

describe("DANFE simplificada", () => {
  it("documento PENDING sai com tarja de pendência (nunca como autorizado)", () => {
    const html = danfeHtml(base);
    expect(html).toContain("SEM VALOR FISCAL — PENDENTE DE AUTORIZAÇÃO");
    expect(html).not.toContain("DOCUMENTO AUTORIZADO");
    expect(html).toContain("PENDENTE DE AUTORIZAÇÃO");
  });

  it("autorizado em produção sai como autorizado; em homologação avisa", () => {
    const prod = danfeHtml({
      ...base,
      documento: { ...base.documento, status: "AUTHORIZED", ambiente: "PRODUCTION" },
    });
    expect(prod).toContain("DOCUMENTO AUTORIZADO");

    const homol = danfeHtml({
      ...base,
      documento: { ...base.documento, status: "AUTHORIZED", ambiente: "HOMOLOGATION" },
    });
    expect(homol).toContain("SEM VALOR FISCAL — HOMOLOGAÇÃO");
  });

  it("cancelada avisa em vez de parecer válida", () => {
    const html = danfeHtml({ ...base, documento: { ...base.documento, status: "CANCELED" } });
    expect(html).toContain("DOCUMENTO CANCELADO");
  });

  it("traz emitente, itens, tributos e forma de pagamento", () => {
    const html = danfeHtml(base);
    expect(html).toContain("Ateliê Aurora");
    expect(html).toContain("Aurora Comércio de Vestuário Ltda");
    expect(html).toContain("12345678000199");
    expect(html).toContain("Vestido midi azul");
    expect(html).toContain("NCM 6204");
    expect(html).toContain("CFOP 5102");
    expect(html).toContain("PIX");
    expect(html).toContain("189,90");
    expect(html).toContain("Valor aproximado dos tributos");
    expect(html).toContain("Maria Silva");
  });

  it("sem consumidor identificado, diz isso em vez de deixar em branco", () => {
    const html = danfeHtml({ ...base, consumidor: null });
    expect(html).toContain("Não identificado");
  });

  it("mostra a chave de acesso formatada quando existe", () => {
    const chave = "31251112345678000199650010000000421000000428";
    const html = danfeHtml({ ...base, documento: { ...base.documento, chaveAcesso: chave, status: "AUTHORIZED", ambiente: "PRODUCTION" } });
    expect(html).toContain(formatarChave(chave));
    expect(formatarChave(chave).split(" ").every((g) => g.length === 4)).toBe(true);
  });

  it("sem chave, avisa que é documento interno", () => {
    const html = danfeHtml(base);
    expect(html).toContain("Documento interno sem chave de acesso");
  });

  it("escapa HTML do conteúdo (nome de produto não vira código)", () => {
    const html = danfeHtml({
      ...base,
      itens: [{ ...base.itens[0], description: '<script>alert("x")</script>Vestido' }],
      consumidor: { nome: "Cliente <b>perigoso</b>", documento: null },
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>perigoso</b>");
  });

  it("sem tributos configurados, a linha não aparece", () => {
    const html = danfeHtml({ ...base, tributosAproximados: null });
    expect(html).not.toContain("Valor aproximado dos tributos");
  });
});
