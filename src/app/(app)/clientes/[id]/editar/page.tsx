import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getCustomerDetail } from "@/server/services/customers";
import { CustomerForm } from "@/components/customers/customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("customers.update")) redirect("/clientes");

  const { id } = await params;
  const data = await getCustomerDetail(id).catch(() => null);
  if (!data) notFound();
  const c = data.customer;

  return (
    <CustomerForm
      mode="edit"
      initial={{
        id: c.id,
        name: c.name,
        document: c.document,
        birthDate: c.birthDate,
        phone: c.phone,
        whatsapp: c.whatsapp,
        email: c.email,
        address: c.address,
        addressNumber: c.addressNumber,
        district: c.district,
        city: c.city,
        state: c.state,
        zip: c.zip,
        notes: c.notes,
        sizePreference: c.sizePreference,
        creditLimit: c.creditLimit,
        isActive: c.isActive,
        acceptsWhatsapp: c.acceptsWhatsapp,
        acceptsEmail: c.acceptsEmail,
      }}
      canSetCreditLimit={user.permissions.includes("credit.limit.update")}
    />
  );
}
