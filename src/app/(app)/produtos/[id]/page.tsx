import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { getProduct } from "@/server/services/products";
import { ProductDetail } from "./product-detail";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("products.view")) redirect("/");

  const { id } = await params;
  try {
    const data = await getProduct(id);
    return (
      <ProductDetail
        data={JSON.parse(JSON.stringify(data))}
        canEdit={user.permissions.includes("products.update")}
        canAdjustStock={user.permissions.includes("stock.adjust")}
        canViewCost={user.permissions.includes("finance.view") || user.permissions.includes("products.price.update")}
      />
    );
  } catch {
    // Não encontrado — inclusive quando o produto é de OUTRA loja: o filtro
    // de isolamento não devolve o registro, então cai aqui.
    notFound();
  }
}

export function generateStaticParams() {
  return [];
}

void Link;
