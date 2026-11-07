import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listSuppliers } from "@/server/services/suppliers";
import { SuppliersView } from "@/components/suppliers/suppliers-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fornecedores" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("suppliers.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const status = (params.status as "ALL" | "ACTIVE" | "INACTIVE") || "ALL";

  const data = await listSuppliers({ search: params.search, status, page, pageSize: 25 });

  return (
    <SuppliersView
      data={data}
      filters={{ search: params.search ?? "", status }}
      permissions={{
        canManage: user.permissions.includes("suppliers.manage"),
        canViewPayables: user.permissions.includes("finance.view"),
      }}
    />
  );
}
