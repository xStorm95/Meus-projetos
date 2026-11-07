import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getCustomerDetail } from "@/server/services/customers";
import { CustomerDetail } from "./customer-detail";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("customers.view")) redirect("/");

  const { id } = await params;
  try {
    const data = await getCustomerDetail(id);
    return (
      <CustomerDetail
        data={JSON.parse(JSON.stringify(data))}
        permissions={{
          canEdit: user.permissions.includes("customers.update"),
          canDelete: user.permissions.includes("customers.delete"),
          canReceive: user.permissions.includes("finance.pay"),
          canCreditLimit: user.permissions.includes("credit.limit.update"),
          canExport: user.permissions.includes("customers.export"),
        }}
      />
    );
  } catch {
    notFound();
  }
}
