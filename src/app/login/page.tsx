import { redirect } from "next/navigation";
import { demoAutoLoginPermitido, getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Entrar — PASSARELA ERP" };

export default async function LoginPage() {
  // Em modo demonstração o acesso é automático — a tela de login é ignorada.
  if (await demoAutoLoginPermitido()) redirect("/");

  const user = await getCurrentUser();
  if (user) redirect("/");

  // Multi-loja: o cadastro é aberto, então "banco sem usuário" não é mais uma
  // instalação pela metade — cada pessoa cria a própria loja nesta tela.
  return <LoginForm />;
}
