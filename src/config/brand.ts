/**
 * MARCA — fonte única do rebrand PASSARELA → ORION.
 *
 * Tudo o que é “identidade” mora aqui: nome, slogan, cores, tipografia e o
 * símbolo das três estrelas. Nenhum componente deve escrever "ORION" na mão
 * (nem manter a palavra antiga): quem precisa do nome importa `BRAND`.
 *
 * Paleta escolhida no pedido:
 *   - fundo #0B0B0F (quase preto, levemente azulado)
 *   - acento #7DB3FF (azul claro; contraste AA sobre o fundo escuro)
 *   - wordmark em caixa alta com letter-spacing 0.3em
 *   - símbolo: três estrelas do Cinturão de Órion
 */

export const BRAND = {
  name: "ORION",
  /** Nome completo usado em título de página e rodapé. */
  fullName: "ORION ERP",
  tagline: "Gestão para o varejo de moda",
  /** Frase curta usada na landing e no login. */
  pitch: "Vendas, estoque, caixa e financeiro no mesmo lugar — feito para quem vende moda.",
  legal: "Dados protegidos conforme a LGPD",
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  /** Versão exibida no rodapé da landing e nas configurações. */
  version: "1.0",
  contact: {
    /** Preenchido quando o responsável informar os dados reais. */
    email: "contato@orionerp.com.br",
    whatsapp: "",
    phone: "",
    city: "",
  },
} as const;

export const BRAND_COLORS = {
  /** Fundo principal do tema escuro. */
  ink: "#0B0B0F",
  /** Acento (azul). */
  accent: "#7DB3FF",
  /** Acento em estado “hover”. */
  accentStrong: "#A6CBFF",
  /** Texto sobre o acento. */
  onAccent: "#07101F",
  /** Superfícies do tema escuro. */
  surface: "#121218",
  surfaceElevated: "#17171F",
  border: "#26262F",
  textPrimary: "#F4F6FA",
  textSecondary: "#B9BFCC",
  textMuted: "#8B92A2",
  /** Estados. */
  success: "#4ADE80",
  warning: "#FBBF24",
  danger: "#F87171",
} as const;

/**
 * Três estrelas alinhadas na diagonal — o Cinturão de Órion.
 * Devolve as coordenadas em um viewBox 0 0 32 32, para qualquer componente
 * (favicon, símbolo do menu, landing) desenhar exatamente a mesma marca.
 */
export const BRAND_STARS = [
  { cx: 10.5, cy: 21, r: 2.6 },
  { cx: 16, cy: 16, r: 3.4 },
  { cx: 21.5, cy: 11, r: 2.6 },
] as const;

/** Caminho completo do símbolo (estrelas + halo), em viewBox 0 0 32 32. */
export function brandStarsSvgProps() {
  return {
    viewBox: "0 0 32 32",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  };
}

/** Wordmark com o espaçamento de letras do manual. */
export const WORDMARK_STYLE = {
  textTransform: "uppercase",
  letterSpacing: "0.3em",
  fontWeight: 600,
} as const;
