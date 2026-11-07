import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ToastProvider } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ToastProvider>{children}</ToastProvider>;
}
