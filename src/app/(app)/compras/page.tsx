import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { financeCategories, suppliers } from "@/server/db/schema";
import { listPurchaseOrders } from "@/server/services/purchases";
import { PurchasesView } from "@/components/purchases/purchases-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    supplierId?: string;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("purchases.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  const [data, supplierRows, categories] = await Promise.all([
    listPurchaseOrders({
      supplierId: params.supplierId,
      status: params.status,
      search: params.search,
      from: params.from,
      to: params.to,
      page,
      pageSize: 25,
    }),
    db
      .select({ id: suppliers.id, legalName: suppliers.legalName })
      .from(suppliers)
      .where(sqlActiveSupplier())
      .orderBy(asc(suppliers.legalName)),
    db
      .select({ id: financeCategories.id, name: financeCategories.name, type: financeCategories.type })
      .from(financeCategories)
      .orderBy(asc(financeCategories.name)),
  ]);

  return (
    <PurchasesView
      data={data}
      filters={{
        status: params.status ?? "ALL",
        search: params.search ?? "",
        from: params.from ?? "",
        to: params.to ?? "",
        supplierId: params.supplierId ?? "",
      }}
      suppliers={supplierRows}
      categories={categories.filter((c) => c.type === "EXPENSE")}
      permissions={{ canManage: user.permissions.includes("purchases.manage") }}
    />
  );
}

function sqlActiveSupplier() {
  return eq(suppliers.isActive, true);
}
