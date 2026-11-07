import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { financeCategories, suppliers } from "@/server/db/schema";
import { listBankAccounts, listPayables } from "@/server/services/finance";
import { PayablesView } from "@/components/finance/payables-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas a pagar" };

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; search?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("finance.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  const [data, categoryRows, supplierRows, accounts] = await Promise.all([
    listPayables({
      status: params.status,
      from: params.from,
      to: params.to,
      search: params.search,
      page,
      pageSize: 25,
    }),
    db
      .select({ id: financeCategories.id, name: financeCategories.name, type: financeCategories.type })
      .from(financeCategories)
      .orderBy(asc(financeCategories.name)),
    db.select({ id: suppliers.id, legalName: suppliers.legalName }).from(suppliers).orderBy(asc(suppliers.legalName)).limit(500),
    listBankAccounts(),
  ]);

  return (
    <PayablesView
      initial={{
        items: data.items.map((p) => ({
          id: p.id,
          description: p.description,
          amount: p.amount,
          paidAmount: p.paidAmount,
          dueDate: p.dueDate,
          status: p.status,
          documentNumber: p.documentNumber,
          installmentNumber: p.installmentNumber,
          installmentTotal: p.installmentTotal,
          notes: p.notes,
        })),
        total: data.total,
        totals: {
          count: data.total,
          total: data.totals?.total ?? "0.00",
          open: data.totals?.open ?? "0.00",
        },
        page: data.page,
        pageSize: data.pageSize,
      }}
      filters={{
        status: params.status ?? "ALL",
        from: params.from ?? "",
        to: params.to ?? "",
        search: params.search ?? "",
      }}
      categories={categoryRows.filter((c) => c.type === "EXPENSE")}
      suppliers={supplierRows}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      permissions={{
        canCreate: user.permissions.includes("finance.create"),
        canPay: user.permissions.includes("finance.pay"),
        canCancel: user.permissions.includes("finance.delete"),
        canExport: user.permissions.includes("reports.export"),
      }}
    />
  );
}
