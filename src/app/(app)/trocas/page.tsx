import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listReturns } from "@/server/services/returns";
import { ReturnsView } from "@/components/returns/returns-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trocas e devoluções" };

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string; search?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("returns.view")) redirect("/");

  const params = await searchParams;
  const data = await listReturns({
    type: params.type,
    from: params.from,
    to: params.to,
    search: params.search,
    page: Math.max(1, Number(params.page ?? 1)),
    pageSize: 25,
  });

  return (
    <ReturnsView
      data={data}
      filters={{
        type: params.type ?? "ALL",
        search: params.search ?? "",
        from: params.from ?? "",
        to: params.to ?? "",
      }}
      permissions={{ canCreate: user.permissions.includes("returns.create") }}
    />
  );
}
