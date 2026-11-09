/**
 * Cor de destaque personalizada — a cor da logo vira a cor do site.
 *
 * O usuário escolhe (ou a gente extrai da logo) um hex; aqui derivamos
 * todos os tons que o tema precisa, com contraste legível:
 *   - cor base (tema claro) e uma versão clareada para o tema escuro
 *   - fundo suave (--accent-soft) nos dois temas
 *   - cor de texto sobre a cor (--accent-contrast) por luminância
 *   - versão escura para hovers (--accent-strong)
 *
 * Puro, sem DOM e sem dependências: roda no servidor e no cliente.
 */

export type ColorTone = "light" | "dark";

export interface AccentPalette {
  accent: string;
  accentSoft: string;
  accentContrast: string;
  accentStrong: string;
  accentDark: string;
  accentSoftDark: string;
  tone: ColorTone;
}

function clamp(n: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, n));
}

/** Aceita "#c9a227", "c9a227", "#f0a" e devolve "#rrggbb" (ou null). */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return "#" + raw.split("").map((c) => c + c).join("").toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return "#" + raw.toLowerCase();
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mistura duas cores: weight = quanto de `a` (0..1). */
export function mix(a: string, b: string, weight: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const w = Math.min(1, Math.max(0, weight));
  return toHex(ca.r * w + cb.r * (1 - w), ca.g * w + cb.g * (1 - w), ca.b * w + cb.b * (1 - w));
}

/** Luminância relativa (WCAG) — decide se o texto sobre a cor é claro ou escuro. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Razão de contraste WCAG entre duas cores (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Texto sobre a cor: escolhe entre branco e quase-preto o que tiver
 * MAIOR contraste (dourado, amarelo e verde-claro pedem texto escuro).
 */
export function bestContrastText(hex: string): string {
  const white = contrastRatio(hex, "#ffffff");
  const ink = contrastRatio(hex, "#14140f");
  return ink > white ? "#14140f" : "#ffffff";
}

/**
 * Ajusta a cor para o tema preservando a identidade:
 *  - claro: só escurece o suficiente para a cor aparecer no fundo branco
 *    (mínimo 2:1 com branco). Dourado continua dourado.
 *  - escuro: clareia até aparecer no fundo escuro (mínimo 3:1).
 */
export function toneForTheme(hex: string, theme: "light" | "dark"): string {
  if (theme === "light") {
    let color = hex;
    // 1) a cor precisa aparecer no fundo branco
    for (let step = 0; step < 12 && contrastRatio(color, "#ffffff") < 2; step++) {
      color = mix(color, "#000000", 0.88);
    }
    // 2) o texto sobre a cor precisa ser legível (AA). Cores "no meio"
    //    (ex.: vermelho #e63946) falham com branco E com preto: aí a cor
    //    é levemente escurecida até o branco passar.
    for (let step = 0; step < 10 && bestContrastText(color) === "#ffffff" && contrastRatio(color, "#ffffff") < 4.5; step++) {
      color = mix(color, "#000000", 0.92);
    }
    for (let step = 0; step < 10 && bestContrastText(color) === "#14140f" && contrastRatio(color, "#14140f") < 4.5; step++) {
      color = mix(color, "#ffffff", 0.94);
    }
    return color;
  }
  let color = hex;
  for (let step = 0; step < 14 && contrastRatio(color, "#12111a") < 3; step++) {
    // Clareia até aparecer no fundo escuro (mistura com branco).
    color = mix("#ffffff", color, step < 6 ? 0.7 : 0.85);
  }
  return color;
}

export function buildAccentPalette(input: string): AccentPalette | null {
  const base = normalizeHex(input);
  if (!base) return null;

  const light = toneForTheme(base, "light");
  const dark = toneForTheme(base, "dark");
  const contrast = bestContrastText(light);
  const tone: ColorTone = contrast === "#14140f" ? "light" : "dark";

  return {
    accent: light,
    // Fundo suave: a cor bem diluída no branco (10% de cor).
    accentSoft: mix("#ffffff", light, 0.9),
    accentContrast: contrast,
    // Hover/pressed: a mesma cor 18% mais escura.
    accentStrong: mix(light, "#000000", 0.82),
    accentDark: dark,
    // No escuro, fundo suave = a cor diluída no fundo escuro (15% de cor).
    accentSoftDark: mix("#15141a", dark, 0.85),
    tone,
  };
}

/** CSS pronto para injetar no <html> (variáveis consumidas pelo tema). */
export function accentCssVars(palette: AccentPalette): string {
  return [
    `--accent-custom:${palette.accent}`,
    `--accent-custom-soft:${palette.accentSoft}`,
    `--accent-custom-contrast:${palette.accentContrast}`,
    `--accent-custom-strong:${palette.accentStrong}`,
    `--accent-custom-dark:${palette.accentDark}`,
    `--accent-custom-soft-dark:${palette.accentSoftDark}`,
  ].join(";");
}

/** Nome estável da cor escolhida (guardado em settings.accentColor). */
export const CUSTOM_ACCENT_PREFIX = "custom:";

export function isCustomAccent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(CUSTOM_ACCENT_PREFIX);
}

export function customAccentHex(value: string | null | undefined): string | null {
  return isCustomAccent(value) ? normalizeHex(value!.slice(CUSTOM_ACCENT_PREFIX.length)) : null;
}

export function customAccentValue(hex: string): string {
  const norm = normalizeHex(hex);
  return norm ? CUSTOM_ACCENT_PREFIX + norm : CUSTOM_ACCENT_PREFIX + "#c9a227";
}
