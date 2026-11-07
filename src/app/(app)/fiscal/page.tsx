import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import {
  fiscalReadiness,
  fiscalStats,
  listFiscalDocuments,
  salesWithoutFiscalDocument,
} from "@/server/services/fiscal";
import { FiscalView } from "./fiscal-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fiscal" };

export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; model?: string; from?: string; to?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("fiscal.view")) redirect("/");

  const params = await searchParams;
  const [documents, readiness, stats, pendingSales] = await Promise.all([
    listFiscalDocuments({
      status: params.status,
      model: params.model,
      from: params.from,
      to: params.to,
      page: Math.max(1, Number(params.page ?? 1)),
      pageSize: 30,
    }),
    fiscalReadiness(),
    fiscalStats(),
    salesWithoutFiscalDocument(40),
  ]);

  return (
    <FiscalView
      documents={documents as never}
      readiness={readiness}
      stats={stats}
      pendingSales={pendingSales}
      filters={{
        status: params.status ?? "ALL",
        model: params.model ?? "ALL",
        from: params.from ?? "",
        to: params.to ?? "",
      }}
      permissions={{
        canEmit: user.permissions.includes("fiscal.emit"),
        canCancel: user.permissions.includes("fiscal.cancel"),
        canConfigure: user.permissions.includes("fiscal.configure"),
      }}
    />
  );
}
