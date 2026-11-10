import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { SaleDetailView } from "@/components/sales/sale-detail-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalhe da venda" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("sales.view")) redirect("/");

  const { id } = await params;
  return <SaleDetailView id={id} podeCancelar={user.permissions.includes("sales.cancel")} />;
}
