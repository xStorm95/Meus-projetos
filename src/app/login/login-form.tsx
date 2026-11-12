"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, Mail, Lock, ShieldCheck, Store, ArrowLeft, Pipette } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { OrionMark, OrionWordmark } from "@/components/brand/orion-mark";
import { BRAND } from "@/config/brand";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"login" | "forgot" | "signup">("login");
  const [signup, setSignup] = React.useState({ storeName: "", ownerName: "", password2: "", accentHex: "#c9a227" });
  const [forgotMessage, setForgotMessage] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/login", { email, password });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (signup.password2 !== password) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/signup", {
        storeName: signup.storeName,
        ownerName: signup.ownerName,
        email,
        password,
        accentHex: signup.accentHex,
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setForgotMessage(null);
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/api/auth/forgot-password", { email });
      setForgotMessage(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-app)] lg:flex-row">
      {/* Painel de marca */}
      <div className="relative hidden overflow-hidden bg-[var(--ink-950)] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, rgba(125,179,255,0.30), transparent 45%), radial-gradient(circle at 82% 72%, rgba(125,179,255,0.14), transparent 52%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <OrionMark size={40} color="#7DB3FF" withGlow />
            <div>
              <p
                className="font-[family-name:var(--font-display)] text-2xl font-semibold uppercase text-white"
                style={{ letterSpacing: "0.3em" }}
              >
                {BRAND.name}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#7DB3FF]">
                {BRAND.tagline}
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-white">
            Gestão completa da sua loja, do caixa ao guarda-roupa.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--ink-300)]">
            Vendas com grade de cores e tamanhos, controle de estoque por variação, crediário
            próprio, financeiro com DRE e relatórios em tempo real — em uma única plataforma.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-[var(--ink-200)]">
            {[
              "PDV com leitor de código de barras e pagamento dividido",
              "Estoque por cor e tamanho com histórico completo",
              "Crediário, contas a pagar e a receber integrados",
              "Dashboard com faturamento, lucro e recompra",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7DB3FF]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-[var(--ink-500)]">
          © {new Date().getFullYear()} {BRAND.fullName} · {BRAND.legal}
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <OrionWordmark size="md" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {mode === "login" ? "Acessar o sistema" : mode === "signup" ? "Criar a minha loja" : "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {mode === "login"
              ? "Entre com suas credenciais para continuar."
              : mode === "signup"
                ? "Nome da loja, sua cor e uma senha. Leva menos de um minuto."
                : "Informe seu e-mail cadastrado para receber as instruções."}
          </p>

          {error && (
            <Alert tone="danger" className="mt-5">
              {error}
            </Alert>
          )}

          {forgotMessage && (
            <Alert tone="success" className="mt-5">
              {forgotMessage}
            </Alert>
          )}

          {mode === "signup" ? (
            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <Field label="Nome da loja" htmlFor="store-name">
                <Input
                  id="store-name"
                  autoFocus
                  required
                  leftIcon={<Store className="h-4 w-4" />}
                  placeholder="Ateliê Aurora"
                  value={signup.storeName}
                  onChange={(e) => setSignup({ ...signup, storeName: e.target.value })}
                />
              </Field>

              <Field label="Seu nome" htmlFor="owner-name">
                <Input
                  id="owner-name"
                  required
                  placeholder="Maria Silva"
                  value={signup.ownerName}
                  onChange={(e) => setSignup({ ...signup, ownerName: e.target.value })}
                />
              </Field>

              <Field label="E-mail" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  leftIcon={<Mail className="h-4 w-4" />}
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Senha" htmlFor="password">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    leftIcon={<Lock className="h-4 w-4" />}
                    placeholder="mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Field label="Repetir senha" htmlFor="password2">
                  <Input
                    id="password2"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    placeholder="repita a senha"
                    value={signup.password2}
                    onChange={(e) => setSignup({ ...signup, password2: e.target.value })}
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/60 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                  <Pipette className="h-3.5 w-3.5" /> Cor da minha logo
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Cor da logo"
                    value={signup.accentHex}
                    onChange={(e) => setSignup({ ...signup, accentHex: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--border-default)] bg-transparent p-0.5"
                  />
                  <span className="font-mono text-[11px] uppercase text-[var(--text-muted)]">{signup.accentHex}</span>
                  <span className="ml-auto rounded-md px-2 py-1 text-[10.5px] font-medium" style={{ background: signup.accentHex, color: "#fff" }}>
                    cor do site
                  </span>
                </div>
                <p className="mt-1.5 text-[10.5px] text-[var(--text-muted)]">
                  Escolha a cor da sua marca. Dá para trocar (ou enviar a logo) depois em Configurações.
                </p>
              </div>

              <Button type="submit" size="lg" className="w-full" loading={loading} leftIcon={<Store className="h-4 w-4" />}>
                Criar loja e entrar
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="flex w-full items-center justify-center gap-1.5 text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Já tenho conta
              </button>
            </form>
          ) : mode === "login" ? (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="E-mail" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  leftIcon={<Mail className="h-4 w-4" />}
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field label="Senha" htmlFor="password">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    leftIcon={<Lock className="h-4 w-4" />}
                    placeholder="••••••••"
                    className="pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                  }}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>

              <Button type="submit" size="lg" className="w-full" loading={loading} leftIcon={<LogIn className="h-4 w-4" />}>
                Entrar
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="w-full text-center text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Não tenho conta — criar a minha loja
              </button>

              <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-[var(--text-muted)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Conexão protegida · Sessão criptografada
              </p>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="mt-6 space-y-4">
              <Field label="E-mail" htmlFor="forgot-email">
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  autoFocus
                  leftIcon={<Mail className="h-4 w-4" />}
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Solicitar redefinição
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setForgotMessage(null);
                  setError(null);
                }}
                className="w-full text-center text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Voltar para o login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
