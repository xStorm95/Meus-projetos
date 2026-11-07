import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import {
  catalogOptions,
  listInventories,
  listMovements,
  listStockPositions,
  restockSuggestions,
  stockOverview,
} from "@/server/services/stock-ops";
import { StockView } from "@/components/stock/stock-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    situation?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("stock.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const situation = (params.situation as "ALL" | "LOW" | "OUT" | "OK") ?? "ALL";

  const [overview, positions, movements, inventories, suggestions, options] = await Promise.all([
    stockOverview(),
    listStockPositions({
      search: params.search,
      situation,
      categoryId: params.categoryId,
      page,
      pageSize: 40,
    }),
    listMovements({ from: params.from, to: params.to, page: 1, pageSize: 40 }),
    listInventories(),
    restockSuggestions(),
    catalogOptions(),
  ]);

  return (
    <StockView
      data={{
        overview,
        positions,
        movements,
        inventories: inventories.map((i) => ({
          id: i.count.id,
          code: i.count.code,
          status: i.count.status,
          startedAt: i.count.startedAt.toISOString(),
          closedAt: i.count.closedAt ? i.count.closedAt.toISOString() : null,
          warehouseName: i.warehouseName,
          startedByName: i.startedByName,
          items: Number(i.items ?? 0),
          counted: Number(i.counted ?? 0),
          divergences: Number(i.divergences ?? 0),
        })),
        suggestions,
        warehouses: options.warehouses.map((w) => ({ id: w.id, name: w.name })),
      }}
      filters={{
        search: params.search ?? "",
        situation,
        categoryId: params.categoryId ?? "",
        from: params.from ?? "",
        to: params.to ?? "",
      }}
      categories={options.categories}
      warehouses={options.warehouses.map((w) => ({ id: w.id, name: w.name }))}
      permissions={{
        canAdjust: user.permissions.includes("stock.adjust"),
        canTransfer: user.permissions.includes("stock.transfer"),
        canExport: user.permissions.includes("reports.export"),
      }}
    />
  );
}
