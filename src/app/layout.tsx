import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { BRAND, BRAND_COLORS } from "@/config/brand";
import "./globals.css";

/**
 * Metadados do layout RAIZ.
 *
 * Aqui ficam apenas os padrões da marca (ORION). Título por loja, template e
 * `noindex` pertencem à área logada e são definidos em `(app)/layout.tsx` —
 * antes o root injetava "PASSARELA ERP" e `noindex` em TODAS as páginas,
 * inclusive na landing pública, que precisa ser indexável.
 */
export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.pitch,
  applicationName: BRAND.fullName,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: BRAND.name },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafb" },
    { media: "(prefers-color-scheme: dark)", color: BRAND_COLORS.ink },
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap"
        />
        <script
          // Evita "flash" de tema: aplica a preferência antes da hidratação
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('orion:theme')||localStorage.getItem('passarela:theme');var a=localStorage.getItem('orion:accent')||localStorage.getItem('passarela:accent');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}if(a){document.documentElement.dataset.accent=a;}}catch(e){}})();`,
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
