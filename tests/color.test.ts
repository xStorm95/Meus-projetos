/**
 * Cor de destaque personalizada (a cor da logo → cor do site).
 *
 * Valida o que aparece na tela: aceitar hex em vários formatos, gerar um
 * fundo suave de verdade, escolher texto legível e garantir que a cor
 * continue visível nos temas claro e escuro.
 */
import { describe, expect, it } from "vitest";
import {
  buildAccentPalette,
  normalizeHex,
  customAccentValue,
  customAccentHex,
  isCustomAccent,
  contrastRatio,
  luminance,
  mix,
} from "@/server/lib/color";

describe("normalizeHex", () => {
  it("aceita com/sem #, 3 dígitos e maiúsculas", () => {
    expect(normalizeHex("#c9a227")).toBe("#c9a227");
    expect(normalizeHex("C9A227")).toBe("#c9a227");
    expect(normalizeHex("#f0a")).toBe("#ff00aa");
    expect(normalizeHex("  #ABC  ")).toBe("#aabbcc");
  });

  it("recusa lixo", () => {
    expect(normalizeHex("vermelho")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex(123)).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("mix / luminance", () => {
  it("mistura proporcional", () => {
    expect(mix("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(mix("#000000", "#ffffff", 1)).toBe("#000000");
  });

  it("luminância nos extremos", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 2);
    expect(luminance("#000000")).toBeCloseTo(0, 2);
  });
});

describe("paleta da cor personalizada", () => {
  const samples = ["#c2405a", "#c9a227", "#0f766e", "#3ca7ff", "#e63946", "#8e44ad", "#1a1a1a", "#f2f2f2"];

  it("toda cor gera paleta completa", () => {
    for (const hex of samples) {
      const palette = buildAccentPalette(hex);
      expect(palette, hex).not.toBeNull();
      for (const key of ["accent", "accentSoft", "accentContrast", "accentStrong", "accentDark", "accentSoftDark"] as const) {
        expect(palette![key], `${hex} ${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("a cor é visível no fundo claro (contraste ≥ 2:1 com branco)", () => {
    for (const hex of samples) {
      const palette = buildAccentPalette(hex)!;
      expect(contrastRatio(palette.accent, "#ffffff"), hex).toBeGreaterThanOrEqual(2);
    }
  });

  it("a cor é visível no tema escuro (contraste ≥ 3:1 com o fundo)", () => {
    for (const hex of samples) {
      const palette = buildAccentPalette(hex)!;
      expect(contrastRatio(palette.accentDark, "#12111a"), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it("o texto sobre a cor sempre tem contraste legível (AA)", () => {
    for (const hex of samples) {
      const palette = buildAccentPalette(hex)!;
      expect(contrastRatio(palette.accent, palette.accentContrast), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dourado claro usa texto escuro (não branco em cima de amarelo)", () => {
    expect(buildAccentPalette("#f5d000")!.accentContrast).toBe("#14140f");
  });

  it("vinho usa texto branco", () => {
    expect(buildAccentPalette("#c2405a")!.accentContrast).toBe("#ffffff");
  });

  it("o fundo suave é claro no tema claro e escuro no tema escuro", () => {
    const palette = buildAccentPalette("#c2405a")!;
    expect(luminance(palette.accentSoft)).toBeGreaterThan(0.8);
    expect(luminance(palette.accentSoftDark)).toBeLessThan(0.15);
  });
});

describe("valor guardado em settings.accentColor", () => {
  it("ida e volta do formato custom:#rrggbb", () => {
    const value = customAccentValue("#C2405A");
    expect(value).toBe("custom:#c2405a");
    expect(isCustomAccent(value)).toBe(true);
    expect(customAccentHex(value)).toBe("#c2405a");
  });

  it("paletas prontas não são custom", () => {
    expect(isCustomAccent("gold")).toBe(false);
    expect(customAccentHex("emerald")).toBeNull();
  });
});
