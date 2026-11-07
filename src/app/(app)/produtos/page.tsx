import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listProducts } from "@/server/services/products";
import { db } from "@/server/db/client";
import { categories, brands } from "@/server/db/schema";
import { asc } from "drizzle-orm";
import { ProductsView } from "./products-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produtos" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; stockFilter?: string; categoryId?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("products.view")) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  const [data, categoryRows, brandRows] = await Promise.all([
    listProducts({
      search: params.search,
      page,
      pageSize: 20,
      stockFilter: (params.stockFilter as "all" | "low" | "out" | "available") ?? "all",
      categoryId: params.categoryId,
      status: params.status,
    }),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(brands).orderBy(asc(brands.name)),
  ]);

  return (
    <ProductsView
      initial={data}
      categories={categoryRows}
      brands={brandRows}
      filters={{
        search: params.search ?? "",
        stockFilter: params.stockFilter ?? "all",
        categoryId: params.categoryId ?? "",
        status: params.status ?? "ALL",
      }}
      canCreate={user.permissions.includes("products.create")}
      canEdit={user.permissions.includes("products.update")}
      canDelete={user.permissions.includes("products.delete")}
    />
  );
}
