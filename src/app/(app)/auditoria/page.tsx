import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { auditFacets, queryAudit } from "@/server/services/audit-query";
import { AuditView } from "./audit-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auditoria" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    action?: string;
    entity?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("audit.view")) redirect("/");

  const params = await searchParams;
  const [data, facets] = await Promise.all([
    queryAudit({
      search: params.search,
      action: params.action,
      entity: params.entity,
      userId: params.userId,
      from: params.from,
      to: params.to,
      page: Math.max(1, Number(params.page ?? 1)),
      pageSize: 50,
    }),
    auditFacets(),
  ]);

  return (
    <AuditView
      data={data}
      facets={facets}
      filters={{
        search: params.search ?? "",
        action: params.action ?? "ALL",
        entity: params.entity ?? "ALL",
        userId: params.userId ?? "",
        from: params.from ?? "",
        to: params.to ?? "",
      }}
    />
  );
}
