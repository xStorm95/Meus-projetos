import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Palco · Sua conta",
  description: "Cadastro, login e perfil com foto. Seus dados guardados no servidor, acessíveis de qualquer aparelho.",
  applicationName: "Palco",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%2314121a'/%3E%3Ctext x='32' y='45' font-family='Georgia,serif' font-size='36' fill='%23eed48b' text-anchor='middle'%3EP%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: "#14121a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
