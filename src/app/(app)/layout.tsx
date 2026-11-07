import { redirect } from "next/navigation";
import { demoAutoLoginEnabled, getCurrentUser } from "@/server/auth/session";
import { getSettingsCached } from "@/server/services/settings";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let appName = "PASSARELA ERP";
  let companyName = "Minha Loja";
  let logoUrl: string | null = null;
  let accentColor = "gold";
  try {
    const settings = await getSettingsCached();
    appName = settings.appName;
    companyName = settings.companyName;
    logoUrl = settings.logoUrl;
    accentColor = settings.accentColor || "gold";
  } catch {
    /* usa padrões */
  }

  return (
    <>
      <script
        // Personalização de cor aplicada antes da hidratação (evita flash)
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('data-accent','${accentColor.replace(/[^a-z]/g, "")}')`,
        }}
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
