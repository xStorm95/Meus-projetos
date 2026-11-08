"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { api, type AccountDTO } from "@/lib/client";
import {
  formatCPF,
  formatPhone,
  normalizeEmail,
  passwordLabel,
  passwordScore,
  validateLogin,
  validateSignup,
  type FieldErrors,
} from "@/lib/validation";
import { Alert, Field, useTheme } from "./ui";

type Mode = "login" | "signup";

export function AuthScreen({ initialMode = "signup" }: { initialMode?: Mode }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [reveal, setReveal] = useState({ login: false, signup: false });
  const [shake, setShake] = useState(false);

  // cadastro
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    phone: "",
    document: "",
    city: "",
    birthDate: "",
  });

  // login
  const [login, setLogin] = useState({ email: "", password: "" });

  const signupRef = useRef<HTMLFormElement>(null);
  const score = useMemo(() => passwordScore(form.password), [form.password]);

  const setField = useCallback((key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const fail = useCallback(
    (message: string, fields?: FieldErrors) => {
      setErrors(fields ?? {});
      setNotice({ kind: "error", text: message });
      setShake(true);
      window.setTimeout(() => setShake(false), 520);
      const firstName = fields ? Object.keys(fields)[0] : null;
      if (firstName) {
        const input = signupRef.current?.querySelector<HTMLElement>(`[name="${firstName}"]`);
        input?.focus();
      }
    },
    [],
  );

  const submitSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setNotice(null);

    const localErrors = validateSignup(form);
    if (Object.keys(localErrors).length) {
      fail("Confira os campos destacados.", localErrors);
      return;
    }

    setBusy(true);
    const result = await api<{ account: AccountDTO }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        email: normalizeEmail(form.email),
      }),
    });
    setBusy(false);

    if (!result.ok) {
      fail(result.error, result.fields);
      return;
    }
    router.replace("/app");
    router.refresh();
  };

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setNotice(null);

    const localErrors = validateLogin(login);
    if (Object.keys(localErrors).length) {
      fail("Confira os campos destacados.", localErrors);
      return;
    }

    setBusy(true);
    const result = await api<{ account: AccountDTO }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalizeEmail(login.email), password: login.password }),
    });
    setBusy(false);

    if (!result.ok) {
      fail(result.error, result.fields);
      return;
    }
    router.replace("/app");
    router.refresh();
  };

  return (
    <div className="site">
      <div className="aurora" aria-hidden="true">
        <span className="blob-a" />
        <span className="blob-b" />
        <span className="blob-c" />
      </div>
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">P</span>
          <span>
            Palco
            <small>conta na nuvem</small>
          </span>
        </span>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggle} type="button" aria-label="Alternar tema" title="Alternar tema">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main className="wrap">
        <div className="auth-shell">
          <section className="pitch animate-up">
            <span className="eyebrow">
              <span className="dot" />
              Sincronizado entre aparelhos
            </span>
            <h1>
              Sua conta,
              <br />
              em qualquer <em>palco</em>.
            </h1>
            <p>
              Crie sua conta uma vez e entre de onde quiser — celular, tablet ou computador. A foto e os
              dados ficam guardados no servidor, não no navegador.
            </p>

            <ul className="feature-list">
              <li className="animate-up delay-1">
                <span className="tick">1</span>
                <span>
                  <strong>Cadastro real no banco.</strong> Nome, e-mail e senha criptografada com scrypt no
                  servidor.
                </span>
              </li>
              <li className="animate-up delay-2">
                <span className="tick">2</span>
                <span>
                  <strong>Foto que persiste.</strong> Você troca a foto e ela aparece em qualquer aparelho
                  depois do login.
                </span>
              </li>
              <li className="animate-up delay-3">
                <span className="tick">3</span>
                <span>
                  <strong>Sessão segura.</strong> Cookie HttpOnly de 24 h, com lista de dispositivos
                  conectados.
                </span>
              </li>
            </ul>
          </section>

          <section className={`card auth-card animate-pop delay-1 ${shake ? "shake" : ""}`}>
            <div className="tabs" data-active={mode}>
              <span className="tabs-indicator" aria-hidden="true" />
              <button
                type="button"
                data-active={mode === "login"}
                onClick={() => {
                  setMode("login");
                  setErrors({});
                  setNotice(null);
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                data-active={mode === "signup"}
                onClick={() => {
                  setMode("signup");
                  setErrors({});
                  setNotice(null);
                }}
              >
                Criar conta
              </button>
            </div>

            {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}

            {mode === "signup" ? (
              <form ref={signupRef} onSubmit={submitSignup} noValidate className="animate-in" key="signup">
                <div className="form-head">
                  <h2>Criar sua conta</h2>
                  <p>Leva menos de um minuto. Os campos com * são obrigatórios.</p>
                </div>

                <Field label="Nome completo" name="name" error={errors.name} required>
                  <div className="control" data-invalid={Boolean(errors.name)}>
                    <input
                      id="name"
                      name="name"
                      autoComplete="name"
                      placeholder="Ana Ribeiro"
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                    />
                  </div>
                </Field>

                <Field label="E-mail" name="email" error={errors.email} required>
                  <div className="control" data-invalid={Boolean(errors.email)}>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="voce@email.com"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                    />
                  </div>
                </Field>

                <div className="grid-2">
                  <Field label="Senha" name="password" error={errors.password} required>
                    <div className="control" data-invalid={Boolean(errors.password)}>
                      <input
                        id="password"
                        name="password"
                        type={reveal.signup ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="mínimo 8 caracteres"
                        value={form.password}
                        onChange={(e) => setField("password", e.target.value)}
                      />
                      <div className="trail">
                        <button
                          type="button"
                          className="reveal-btn"
                          onClick={() => setReveal((prev) => ({ ...prev, signup: !prev.signup }))}
                        >
                          {reveal.signup ? "ocultar" : "mostrar"}
                        </button>
                      </div>
                    </div>
                  </Field>

                  <Field label="Repetir senha" name="passwordConfirm" error={errors.passwordConfirm} required>
                    <div className="control" data-invalid={Boolean(errors.passwordConfirm)}>
                      <input
                        id="passwordConfirm"
                        name="passwordConfirm"
                        type={reveal.signup ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="repita a senha"
                        value={form.passwordConfirm}
                        onChange={(e) => setField("passwordConfirm", e.target.value)}
                      />
                    </div>
                  </Field>
                </div>

                {form.password ? (
                  <div className="strength animate-in" data-score={score}>
                    <div className="strength-bar">
                      <span style={{ width: `${Math.max(8, (score + 1) * 20)}%` }} />
                    </div>
                    <span className="strength-label">{passwordLabel(score)}</span>
                  </div>
                ) : null}

                <div className="grid-2" style={{ marginTop: 16 }}>
                  <Field label="Celular" name="phone" error={errors.phone} hint="Opcional, com DDD">
                    <div className="control" data-invalid={Boolean(errors.phone)}>
                      <input
                        id="phone"
                        name="phone"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(31) 99999-0000"
                        value={form.phone}
                        onChange={(e) => setField("phone", formatPhone(e.target.value))}
                      />
                    </div>
                  </Field>

                  <Field label="CPF" name="document" error={errors.document} hint="Opcional">
                    <div className="control" data-invalid={Boolean(errors.document)}>
                      <input
                        id="document"
                        name="document"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={form.document}
                        onChange={(e) => setField("document", formatCPF(e.target.value))}
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid-2">
                  <Field label="Cidade" name="city" error={errors.city}>
                    <div className="control">
                      <input
                        id="city"
                        name="city"
                        autoComplete="address-level2"
                        placeholder="Ipatinga, MG"
                        value={form.city}
                        onChange={(e) => setField("city", e.target.value)}
                      />
                    </div>
                  </Field>

                  <Field label="Nascimento" name="birthDate" error={errors.birthDate}>
                    <div className="control">
                      <input
                        id="birthDate"
                        name="birthDate"
                        type="date"
                        value={form.birthDate}
                        onChange={(e) => setField("birthDate", e.target.value)}
                      />
                    </div>
                  </Field>
                </div>

                <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
                  {busy ? <span className="spinner" /> : null}
                  {busy ? "Criando sua conta..." : "Criar conta e entrar"}
                </button>

                <p className="field-hint" style={{ textAlign: "center", marginTop: 14 }}>
                  Sua senha é criptografada no servidor. Nunca guardamos texto puro.
                </p>
              </form>
            ) : (
              <form onSubmit={submitLogin} noValidate className="animate-in" key="login">
                <div className="form-head">
                  <h2>Entrar na conta</h2>
                  <p>Use o mesmo e-mail e senha que você cadastrou.</p>
                </div>

                <Field label="E-mail" name="email" error={errors.email} required>
                  <div className="control" data-invalid={Boolean(errors.email)}>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="voce@email.com"
                      value={login.email}
                      onChange={(e) => setLogin({ ...login, email: e.target.value })}
                    />
                  </div>
                </Field>

                <Field label="Senha" name="password" error={errors.password} required>
                  <div className="control" data-invalid={Boolean(errors.password)}>
                    <input
                      id="login-password"
                      name="password"
                      type={reveal.login ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="sua senha"
                      value={login.password}
                      onChange={(e) => setLogin({ ...login, password: e.target.value })}
                    />
                    <div className="trail">
                      <button
                        type="button"
                        className="reveal-btn"
                        onClick={() => setReveal((prev) => ({ ...prev, login: !prev.login }))}
                      >
                        {reveal.login ? "ocultar" : "mostrar"}
                      </button>
                    </div>
                  </div>
                </Field>

                <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 6 }}>
                  {busy ? <span className="spinner" /> : null}
                  {busy ? "Entrando..." : "Entrar"}
                </button>

                <p className="field-hint" style={{ textAlign: "center", marginTop: 14 }}>
                  Não tem conta ainda?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setErrors({});
                      setNotice(null);
                    }}
                    style={{
                      border: 0,
                      background: "none",
                      color: "var(--accent)",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Criar agora
                  </button>
                </p>
              </form>
            )}
          </section>
        </div>
      </main>

      <footer className="footer">
        <span>Palco · conta com foto sincronizada na nuvem</span>
        <span>
          Banco de dados: <code>PostgreSQL</code>
        </span>
      </footer>
    </div>
  );
}
