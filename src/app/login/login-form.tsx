"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, Mail, Lock, ShieldCheck, Terminal } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";

export function LoginForm({ setupRequired }: { setupRequired: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"login" | "forgot">("login");
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
              "radial-gradient(circle at 20% 20%, rgba(201,162,39,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(216,160,166,0.30), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--gold-500)]/40 bg-[var(--gold-500)]/10">
              <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--gold-300)]">
                P
              </span>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-wide text-white">
                PASSARELA
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gold-400)]">
                ERP para moda
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium leading-tight text-white">
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
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold-400)]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-[var(--ink-500)]">
          © {new Date().getFullYear()} PASSARELA ERP · Dados protegidos conforme a LGPD
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]">
              <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--accent-contrast)]">
                P
              </span>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-xl font-semibold">PASSARELA</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                ERP para moda
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {mode === "login" ? "Acessar o sistema" : "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {mode === "login"
              ? "Entre com suas credenciais para continuar."
              : "Informe seu e-mail cadastrado para receber as instruções."}
          </p>

          {setupRequired && (
            <Alert tone="warning" title="Primeiro acesso" className="mt-5">
              Nenhum usuário cadastrado. Crie o administrador inicial executando no servidor:
              <code className="mt-1.5 flex items-center gap-1.5 rounded-md bg-black/10 px-2 py-1 font-mono text-[11px]">
                <Terminal className="h-3 w-3" /> npm run admin:create
              </code>
            </Alert>
          )}

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

          {mode === "login" ? (
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
