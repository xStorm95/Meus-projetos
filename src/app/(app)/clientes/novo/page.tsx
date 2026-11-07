import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { CustomerForm } from "@/components/customers/customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo cliente" };

export default async function NewCustomerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("customers.create")) redirect("/clientes");
  return <CustomerForm mode="create" canSetCreditLimit={user.permissions.includes("credit.limit.update")} />;
}
