import { redirect } from "next/navigation";
import { demoAutoLoginEnabled, getCurrentUser } from "@/server/auth/session";
import { getSettingsCached } from "@/server/services/settings";
import {
  isCustomAccent,
  customAccentHex,
  buildAccentPalette,
  accentCssVars,
} from "@/server/lib/color";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // getCurrentUser já colocou a loja do usuário no contexto desta requisição
  // (inclusive para as páginas, que o React renderiza em paralelo).
  return renderShell(user, children);
}

async function renderShell(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  children: React.ReactNode,
) {
  let appName = "PASSARELA ERP";
  let companyName = "Minha Loja";
  let logoUrl: string | null = null;
  let accentColor = "gold";
  let accentHex: string | null = null;
  try {
    const settings = await getSettingsCached();
    appName = settings.appName;
    companyName = settings.companyName;
    logoUrl = settings.logoUrl;
    accentColor = settings.accentColor || "gold";
    accentHex = isCustomAccent(accentColor) ? customAccentHex(accentColor) : null;
  } catch {
    /* usa padrões */
  }

  // Cor personalizada (a cor da logo) derivada em tons legíveis.
  const palette = accentHex ? buildAccentPalette(accentHex) : null;
  const accentName = accentColor.replace(/[^a-z]/g, "") || "gold";
  const accentBoot = palette
    ? `(function(){var h=document.documentElement;` +
      `h.setAttribute('data-accent','${accentName}');` +
      `h.setAttribute('data-accent-hex','${palette.accent}');` +
      `h.setAttribute('data-accent-tone','${palette.tone}');` +
      `h.style.cssText+=';${accentCssVars(palette)}';})()`
    : `document.documentElement.setAttribute('data-accent','${accentName}')`;

  return (
    <>
      <script
        // Personalização de cor aplicada antes da hidratação (evita flash)
        dangerouslySetInnerHTML={{ __html: accentBoot }}
      />
      <AppShell
      user={user}
      appName={appName}
      companyName={companyName}
      logoUrl={logoUrl}
      demoMode={demoAutoLoginEnabled()}
    >
        {children}
      </AppShell>
    </>
  );
}
