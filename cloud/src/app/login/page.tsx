import { redirect } from "next/navigation";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getSession } from "@/lib/session";
import { AuthScreen } from "@/components/AuthScreen";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/app");

  let hasAccounts = true;
  try {
    const rows = await db.select({ id: accounts.id }).from(accounts).limit(1);
    hasAccounts = rows.length > 0;
  } catch {
    hasAccounts = true;
  }

  return <AuthScreen initialMode={hasAccounts ? "login" : "signup"} />;
}
