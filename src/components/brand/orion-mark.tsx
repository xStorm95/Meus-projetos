import { BRAND_STARS, brandStarsSvgProps } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Símbolo da ORION: três estrelas na diagonal (Cinturão de Órion).
 *
 * O mesmo desenho é usado no menu, no login, na landing e no favicon. As
 * coordenadas vêm de `@/config/brand` para que qualquer novo uso (favicon SVG,
 * imagem de compartilhamento) desenhe exatamente a mesma marca.
 */
export function OrionMark({
  className,
  size = 28,
  /** Cor das estrelas; o padrão é o acento corrente do tema. */
  color = "currentColor",
  /** Halo suave atrás das estrelas (usado em fundos escuros). */
  withGlow = false,
}: {
  className?: string;
  size?: number;
  color?: string;
  withGlow?: boolean;
}) {
  return (
    <svg
      {...brandStarsSvgProps()}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="ORION"
    >
      {withGlow && (
        <defs>
          <radialGradient id="orion-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {withGlow && <circle cx="16" cy="16" r="16" fill="url(#orion-halo)" />}
      {BRAND_STARS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={color} />
      ))}
    </svg>
  );
}

/**
 * Wordmark: símbolo + nome em caixa alta com o espaçamento do manual.
 * O `tracking` do Tailwind não chega a 0.3em com precisão, então o valor vai
 * em estilo inline (o manual é explícito sobre o espaçamento).
 */
export function OrionWordmark({
  className,
  name = "ORION",
  size = "md",
  showMark = true,
  color,
}: {
  className?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  showMark?: boolean;
  color?: string;
}) {
  const texto =
    size === "sm" ? "text-[13px]" : size === "lg" ? "text-2xl" : "text-base";
  const marca = size === "sm" ? 20 : size === "lg" ? 34 : 26;
  return (
    <span className={cn("inline-flex items-center gap-2", className)} style={color ? { color } : undefined}>
      {showMark && <OrionMark size={marca} withGlow />}
      <span
        className={cn("font-[family-name:var(--font-display)] font-semibold uppercase", texto)}
        style={{ letterSpacing: "0.3em" }}
      >
        {name}
      </span>
    </span>
  );
}
