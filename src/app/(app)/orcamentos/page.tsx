import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { customers } from "@/server/db/schema";
import { listQuotes, refreshExpiredQuotes, quoteStats } from "@/server/services/quotes";
import { getSettingsCached } from "@/server/services/settings";
import { QuotesView } from "@/components/quotes/quotes-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamentos" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; from?: string; to?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("quotes.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  await refreshExpiredQuotes();

  const from = params.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = params.to ?? new Date().toISOString().slice(0, 10);

  const [data, stats, customerRows, settings] = await Promise.all([
    listQuotes({
      status: params.status,
      search: params.search,
      from: params.from,
      to: params.to,
      page,
      pageSize: 25,
    }),
    quoteStats(from, to),
    db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.isActive, true), isNull(customers.deletedAt)))
      .orderBy(asc(customers.name))
      .limit(1000),
    getSettingsCached(),
  ]);

  return (
    <QuotesView
      data={data}
      stats={stats}
      filters={{
        status: params.status ?? "ALL",
        search: params.search ?? "",
        from: params.from ?? "",
        to: params.to ?? "",
      }}
      customers={customerRows}
      company={{
        name: settings.companyName,
        document: settings.companyDocument,
        phone: settings.companyPhone,
        address: settings.companyAddress,
      }}
      permissions={{
        canManage: user.permissions.includes("quotes.manage"),
        canSell: user.permissions.includes("sales.create"),
      }}
    />
  );
}
