import { redirect } from "next/navigation";
import { and, eq, isNull, desc } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { customers, sales } from "@/server/db/schema";
import { getSettingsCached } from "@/server/services/settings";
import { discountLimitFor } from "@/server/auth/permissions";
import { PdvView } from "./pdv-view";
import { PdvResume } from "./pdv-resume";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova Venda" };

export default async function PdvPage({
  searchParams,
}: {
  searchParams: Promise<{ retomar?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("sales.create")) {
    redirect("/vendas");
  }

  const params = await searchParams;
  const settings = await getSettingsCached();

  const openSalesRows = await db
    .select({
      id: sales.id,
      number: sales.number,
      total: sales.total,
      itemCount: sales.itemCount,
      createdAt: sales.createdAt,
      customerName: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.status, "OPEN"), isNull(sales.canceledAt)))
    .orderBy(desc(sales.createdAt))
    .limit(30);

  if (params.retomar) {
    return <PdvResume saleId={params.retomar} />;
  }

  return (
    <PdvView
      sellerId={user.id}
      sellerName={user.name}
      maxDiscount={discountLimitFor(user.role, settings)}
      canUnlimitedDiscount={user.permissions.includes("sales.discount.unlimited")}
      settings={{
        requireDiscountReason: settings.requireDiscountReason,
        creditInterestRate: settings.creditInterestRate,
        offlineEnabled: settings.offlineSalesEnabled,
      }}
      openSales={openSalesRows.map((s) => ({
        id: s.id,
        number: s.number,
        total: s.total,
        itemCount: s.itemCount,
        customerName: s.customerName,
      }))}
      permissions={{
        canCancel: user.permissions.includes("sales.cancel"),
        canDiscount: user.permissions.includes("sales.discount"),
      }}
    />
  );
}
