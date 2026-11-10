/**
 * Validação do cadastro de produto.
 *
 * Regressão do erro "Invalid uuid (categoryId)": o formulário manda "" quando
 * o <select> está em "Selecione", e a API precisa entender isso como "sem
 * categoria" (null), não como erro.
 */
import { describe, expect, it } from "vitest";
import { productSchema as produto } from "@/server/lib/product-schema";

const base = { name: "Vestido Midi", costPrice: "50,00", salePrice: "199,90" };

describe("validação do produto", () => {
  it("aceita produto sem categoria (select vazio) — o bug do Invalid uuid", () => {
    const r = produto.safeParse({
      ...base,
      categoryId: "",
      subcategoryId: "",
      brandId: "",
      supplierId: "",
      collectionId: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categoryId).toBeNull();
      expect(r.data.brandId).toBeNull();
      expect(r.data.supplierId).toBeNull();
      expect(r.data.collectionId).toBeNull();
    }
  });

  it("aceita produto sem nenhum dos campos opcionais", () => {
    expect(produto.safeParse(base).success).toBe(true);
  });

  it("aceita categoria válida (uuid)", () => {
    const id = "5f3d1a2b-8c4e-4f6a-9b0c-1d2e3f4a5b6c";
    const r = produto.safeParse({ ...base, categoryId: id });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoryId).toBe(id);
  });

  it("aceita null explícito (edição limpando a categoria)", () => {
    const r = produto.safeParse({ ...base, categoryId: null, brandId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoryId).toBeNull();
  });

  it("continua recusando texto que não é uuid", () => {
    const r = produto.safeParse({ ...base, categoryId: "vestidos" });
    expect(r.success).toBe(false);
  });

  it("aceita preço em reais com vírgula", () => {
    const r = produto.safeParse({ ...base, salePrice: "R$ 1.234,56" });
    expect(r.success).toBe(true);
  });

  it("exige nome e preço", () => {
    expect(produto.safeParse({ costPrice: "10", salePrice: "20" }).success).toBe(false);
    expect(produto.safeParse({ name: "X", costPrice: "10", salePrice: "20" }).success).toBe(false);
  });

  it("aceita grade de cores e tamanhos", () => {
    const r = produto.safeParse({
      ...base,
      grid: {
        colorIds: ["5f3d1a2b-8c4e-4f6a-9b0c-1d2e3f4a5b6c"],
        sizeIds: ["6a4e2b3c-9d5f-4a7b-8c1d-2e3f4a5b6c7d"],
      },
    });
    expect(r.success).toBe(true);
  });

  /**
   * Regressão do erro 500 ao cadastrar: as colunas promo_starts_at/promo_ends_at
   * são `date` e o formulário manda "" quando a promoção não tem período.
   * O Postgres recusava com 22007 ("invalid input syntax for type date") e o
   * usuário via "Erro interno do servidor".
   */
  it("converte datas de promoção vazias em null (bug do erro 500)", () => {
    const r = produto.safeParse({ ...base, promoStartsAt: "", promoEndsAt: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.promoStartsAt).toBeNull();
      expect(r.data.promoEndsAt).toBeNull();
    }
  });

  it("mantém datas de promoção válidas como vieram", () => {
    const r = produto.safeParse({
      ...base,
      promoStartsAt: "2026-01-01",
      promoEndsAt: "2026-01-31",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.promoStartsAt).toBe("2026-01-01");
      expect(r.data.promoEndsAt).toBe("2026-01-31");
    }
  });

  it("aceita data de promoção nula (sem período)", () => {
    const r = produto.safeParse({ ...base, promoStartsAt: null, promoEndsAt: null });
    expect(r.success).toBe(true);
  });

  it("payload completo do formulário com todos os campos vazios passa", () => {
    // Exatamente o que o formulário envia quando nada além de nome/preço é preenchido.
    const r = produto.safeParse({
      name: "Blusa Teste",
      reference: "",
      barcode: "",
      description: "",
      categoryId: "",
      subcategoryId: "",
      brandId: "",
      supplierId: "",
      collectionId: "",
      material: "",
      composition: "",
      costPrice: 10,
      salePrice: 20,
      promoPrice: null,
      promoStartsAt: "",
      promoEndsAt: "",
      maxDiscountPercent: null,
      lowStock: 5,
      status: "ACTIVE",
      showOnline: false,
      notes: "",
      ncm: "",
      cest: "",
      cfop: "",
      csosn: "102",
      origin: "0",
      unit: "UN",
      images: [],
      variants: [
        { colorId: null, sizeId: null, barcode: null, costPrice: 10, salePrice: 20, stockQty: 0 },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.promoStartsAt).toBeNull();
      expect(r.data.promoEndsAt).toBeNull();
      expect(r.data.categoryId).toBeNull();
    }
  });
});
