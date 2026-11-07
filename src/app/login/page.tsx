import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { demoAutoLoginEnabled, getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Entrar — PASSARELA ERP" };

export default async function LoginPage() {
  // Em modo demonstração o acesso é automático — a tela de login é ignorada.
  if (demoAutoLoginEnabled()) redirect("/");

  const user = await getCurrentUser();
  if (user) redirect("/");

  let setupRequired = false;
  let totalUsers = 0;
  try {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    totalUsers = Number(rows[0]?.count ?? 0);
    setupRequired = totalUsers === 0;
  } catch {
    setupRequired = false;
  }
  void eq;

  return <LoginForm setupRequired={setupRequired} />;
}
