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
});
