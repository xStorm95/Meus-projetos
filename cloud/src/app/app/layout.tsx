export const dynamic = "force-dynamic";

/** O ERP traz o próprio CSS: este layout só evita herdar estilos da conta. */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
