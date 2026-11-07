import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listBankAccounts, listReceivables, refreshOverdueReceivables } from "@/server/services/finance";
import { ReceivablesView } from "@/components/finance/receivables-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas a receber" };

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    overdueOnly?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("finance.view") && !user.permissions.includes("credit.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  await refreshOverdueReceivables();

  const [data, accounts] = await Promise.all([
    listReceivables({
      status: params.status,
      from: params.from,
      to: params.to,
      overdueOnly: params.overdueOnly === "true",
      page,
      pageSize: 25,
    }),
    listBankAccounts(),
  ]);

  return (
    <ReceivablesView
      initial={{
        items: data.items.map((row) => ({
          id: row.receivable.id,
          description: row.receivable.description,
          amount: row.receivable.amount,
          paidAmount: row.receivable.paidAmount,
          penaltyAmount: row.receivable.penaltyAmount,
          interestAmount: row.receivable.interestAmount,
          dueDate: row.receivable.dueDate,
          status: row.receivable.status,
          installmentNumber: row.receivable.installmentNumber,
          installmentTotal: row.receivable.installmentTotal,
          customerId: row.receivable.customerId,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          saleNumber: row.saleNumber,
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
        overdueOnly: params.overdueOnly === "true",
      }}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      permissions={{
        canReceive: user.permissions.includes("finance.pay"),
        canExport: user.permissions.includes("reports.export"),
      }}
    />
  );
}
