import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { getSettingsCached } from "@/server/services/settings";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  let appName = "PASSARELA ERP";
  let companyName = "";
  try {
    const settings = await getSettingsCached();
    appName = settings.appName;
    companyName = settings.companyName;
  } catch {
    /* banco indisponível: usa padrão */
  }
  return {
    title: {
      default: `${appName} — Gestão para varejo de moda`,
      template: `%s · ${appName}`,
    },
    description: `Sistema de gestão completo para lojas de moda${companyName ? ` — ${companyName}` : ""}: PDV, estoque com grade, crediário, financeiro e relatórios.`,
    manifest: "/manifest.webmanifest",
    applicationName: appName,
    appleWebApp: { capable: true, statusBarStyle: "default", title: appName },
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f13" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap"
        />
        <script
          // Evita "flash" de tema: aplica a preferência antes da hidratação
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('passarela:theme');var a=localStorage.getItem('passarela:accent');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}if(a){document.documentElement.dataset.accent=a;}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ duration: 4000, style: { fontSize: "13px" } }}
          />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
