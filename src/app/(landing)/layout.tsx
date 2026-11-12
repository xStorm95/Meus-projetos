/**
 * Layout da área PÚBLICA (landing, termos, privacidade).
 *
 * Separado do layout do app de propósito: a landing não carrega o AppShell
 * (menu lateral, sessão, busca global) e pode ser estática/indexável, enquanto
 * tudo dentro de `(app)` exige login e é `noindex`.
 *
 * O fundo escuro vale só aqui: `data-theme="orion"` liga as variáveis do tema
 * escuro sem depender da preferência do sistema do visitante.
 */
import type { Metadata, Viewport } from "next";
import { BRAND, BRAND_COLORS } from "@/config/brand";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.pitch,
  applicationName: BRAND.fullName,
  keywords: [
    "sistema para loja de roupa",
    "ERP moda",
    "PDV para varejo",
    "controle de estoque com grade",
    "crediário",
    "gestão de loja de moda",
  ],
  authors: [{ name: BRAND.fullName }],
  creator: BRAND.fullName,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: BRAND.fullName,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.pitch,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.pitch,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: BRAND_COLORS.ink,
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      // `theme-dark` fixo: a landing é escura independentemente da preferência
      // do visitante (o app interno continua respeitando o tema salvo).
      className="theme-dark min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]"
      style={{ colorScheme: "dark" }}
    >
      {children}
    </div>
  );
}
