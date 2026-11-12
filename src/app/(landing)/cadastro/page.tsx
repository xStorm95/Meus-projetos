"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { BRAND } from "@/config/brand";
import { OrionMark, OrionWordmark } from "@/components/brand/orion-mark";

/**
 * Cadastro público — cria a loja e o dono em um passo.
 *
 * É a mesma API usada pela tela de login (`POST /api/auth/signup`), que já
 * cria a empresa, o usuário ADMIN, as configurações padrão, o depósito e as
 * categorias iniciais. Aqui só há uma tela própria para a landing, sem menu do
 * app, com validação imediata e mensagens claras.
 */
export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = React.useState({
    storeName: "",
    ownerName: "",
    email: "",
    password: "",
    password2: "",
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [aceite, setAceite] = React.useState(false);

  function set<K extends keyof typeof form>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  /** Mesma política do servidor, para avisar antes de enviar. */
  const forca = forcaSenha(form.password);
  const senhasIguais = form.password2.length === 0 || form.password === form.password2;
  const podeEnviar =
    form.storeName.trim().length >= 2 &&
    form.ownerName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    forca.ok &&
    form.password === form.password2 &&
    aceite;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeName: form.storeName.trim(),
          ownerName: form.ownerName.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });
      const dados = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErro(dados.error ?? "Não foi possível criar a conta. Tente novamente.");
        return;
      }
      // A sessão já vem criada pelo cadastro: entra direto no painel.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor. Verifique sua conexão.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border-default)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" aria-label={BRAND.fullName}>
            <OrionWordmark size="sm" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Já tenho conta
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-10">
        <div className="text-center">
          <OrionMark size={36} withGlow className="mx-auto text-[var(--accent)]" />
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Criar minha loja
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Leva menos de dois minutos. Sem cartão de crédito.
          </p>
        </div>

        <form onSubmit={enviar} className="mt-8 space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6">
          <Campo
            label="Nome da loja"
            hint="Aparece no topo do sistema e no comprovante."
            value={form.storeName}
            onChange={(v) => set("storeName", v)}
            placeholder="Ex.: Ateliê Aurora"
            autoFocus
            required
          />
          <Campo
            label="Seu nome"
            value={form.ownerName}
            onChange={(v) => set("ownerName", v)}
            placeholder="Como você quer ser chamado"
            required
          />
          <Campo
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(v) => set("email", v)}
            placeholder="voce@suamarca.com.br"
            autoComplete="email"
            required
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="No mínimo 8 caracteres"
                autoComplete="new-password"
                className="field pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.password.length > 0 && (
              <div className="mt-2 space-y-1">
                <BarraForca forca={forca} />
                <p
                  className={`text-[11px] ${
                    forca.ok ? "text-[var(--success)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {forca.aviso}
                </p>
              </div>
            )}
          </div>

          <Campo
            label="Repita a senha"
            type="password"
            value={form.password2}
            onChange={(v) => set("password2", v)}
            placeholder="Digite de novo"
            autoComplete="new-password"
            required
          />
          {!senhasIguais && (
            <p className="-mt-2 text-[11px] font-medium text-[var(--danger)]">As senhas não conferem.</p>
          )}

          <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="text-[var(--accent)] underline-offset-2 hover:underline">
                termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="text-[var(--accent)] underline-offset-2 hover:underline">
                política de privacidade
              </Link>
              . {BRAND.legal}.
            </span>
          </label>

          {erro && (
            <div role="alert" className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={!podeEnviar || carregando}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-sm font-semibold text-[var(--accent-contrast)] transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
          >
            {carregando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Criando sua loja…
              </>
            ) : (
              <>
                Criar loja e entrar <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-[var(--text-muted)]">
            Cada conta cria uma loja própria, com dados isolados das demais.
          </p>
        </form>

        <ul className="mt-6 grid gap-2 sm:grid-cols-3">
          {["PDV pronto", "Estoque com grade", "Caixa e financeiro"].map((t) => (
            <li key={t} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <Check className="h-3.5 w-3.5 text-[var(--success)]" /> {t}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Campo({
  label,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  autoFocus,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required={required}
        className="field"
      />
      {hint && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * Espelha `validatePasswordStrength` do servidor:
 * mínimo 8 caracteres, ao menos uma letra e ao menos um número.
 * O servidor continua sendo a autoridade; aqui é só para avisar antes.
 */
const SENHAS_COMUNS = ["12345678", "senha123", "password", "admin123", "passarela"];

function forcaSenha(senha: string): { ok: boolean; nivel: 0 | 1 | 2 | 3; aviso: string } {
  if (senha.length === 0) return { ok: false, nivel: 0, aviso: "" };

  const temLetra = /[a-zA-Z]/.test(senha);
  const temNumero = /[0-9]/.test(senha);
  const comum = SENHAS_COMUNS.includes(senha.toLowerCase());
  const longo = senha.length >= 8;
  const ok = longo && temLetra && temNumero && !comum;

  // Nível só para o desenho da barra (não altera a regra).
  let pontos = 0;
  if (longo) pontos++;
  if (senha.length >= 12) pontos++;
  if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  const nivel = (ok ? Math.min(3, Math.max(1, pontos)) : 0) as 0 | 1 | 2 | 3;

  const aviso = comum
    ? "Esta senha é muito comum. Escolha outra."
    : !longo
      ? "Use pelo menos 8 caracteres."
      : !temLetra
        ? "Inclua ao menos uma letra."
        : !temNumero
          ? "Inclua ao menos um número."
          : "Boa! Quanto mais longa, melhor.";

  return { ok, nivel, aviso };
}

function BarraForca({ forca }: { forca: { ok: boolean; nivel: 0 | 1 | 2 | 3 } }) {
  const cores = ["bg-[var(--danger)]", "bg-[var(--warning)]", "bg-[var(--accent)]", "bg-[var(--success)]"];
  return (
    <div className="flex gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full ${
            forca.ok && i < forca.nivel ? cores[forca.nivel] : forca.ok ? cores[1] : "bg-[var(--danger)]/40"
          }`}
        />
      ))}
    </div>
  );
}
