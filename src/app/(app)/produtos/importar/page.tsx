import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { ImportView } from "./import-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar produtos" };

export default async function ImportProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("products.view")) redirect("/");

  return <ImportView canImport={user.permissions.includes("products.import")} />;
}
