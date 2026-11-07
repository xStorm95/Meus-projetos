"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  compressImage,
  deviceLabel,
  formatDate,
  formatDateTime,
  relativeTime,
  type AccountDTO,
  type SessionDTO,
} from "@/lib/client";
import { formatCPF, formatPhone, normalizeEmail, passwordLabel, passwordScore, type FieldErrors } from "@/lib/validation";
import { Alert, Avatar, CountUp, Field, Modal, Skeleton, useTheme, useToast } from "./ui";

type Tab = "dados" | "foto" | "seguranca";

export function Dashboard({
  account: initialAccount,
  sessions: initialSessions,
  currentSessionExpiresAt,
}: {
  account: AccountDTO;
  sessions: SessionDTO[];
  currentSessionExpiresAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { theme, toggle } = useTheme();

  const [account, setAccount] = useState(initialAccount);
  const [sessions, setSessions] = useState(initialSessions);
  const [tab, setTab] = useState<Tab>("dados");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reveal, setReveal] = useState({ current: false, next: false });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({
    name: account.name,
    email: account.email,
    phone: account.phone ? formatPhone(account.phone) : "",
    document: account.document ? formatCPF(account.document) : "",
    city: account.city ?? "",
    birthDate: account.birthDate ?? "",
    bio: account.bio ?? "",
  });

  const score = passwordScore(pw.newPassword);
  const dirty =
    form.name !== account.name ||
    normalizeEmail(form.email) !== normalizeEmail(account.email) ||
    form.phone !== (account.phone ? formatPhone(account.phone) : "") ||
    form.document !== (account.document ? formatCPF(account.document) : "") ||
    form.city !== (account.city ?? "") ||
    form.birthDate !== (account.birthDate ?? "") ||
    form.bio !== (account.bio ?? "");

  /* ------------------- feedback ------------------- */
  const flash = useCallback((kind: "error" | "success" | "info", text: string) => {
    setNotice({ kind, text });
    toast.push(text, kind);
  }, [toast]);

  /* ------------------- perfil ------------------- */
  const saveProfile = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy("profile");
    setErrors({});

    const result = await api<{ account: AccountDTO }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ ...form, email: normalizeEmail(form.email) }),
    });
    setBusy(null);

    if (!result.ok) {
      setErrors(result.fields ?? {});
      setNotice({ kind: "error", text: result.error });
      toast.push(result.error, "error");
      return;
    }

    setAccount(result.data.account);
    setForm({
      name: result.data.account.name,
      email: result.data.account.email,
      phone: result.data.account.phone ? formatPhone(result.data.account.phone) : "",
      document: result.data.account.document ? formatCPF(result.data.account.document) : "",
      city: result.data.account.city ?? "",
      birthDate: result.data.account.birthDate ?? "",
      bio: result.data.account.bio ?? "",
    });
    flash("success", "Dados salvos no servidor. Já valem em qualquer aparelho.");
    router.refresh();
  };

  /* ------------------- foto ------------------- */
  const sendPhoto = useCallback(
    async (file: File) => {
      setUploading(true);
      setNotice(null);
      try {
        const avatar = await compressImage(file, 512, 0.88);
        const result = await api<{ account: AccountDTO }>("/api/profile/avatar", {
          method: "PUT",
          body: JSON.stringify({ avatar }),
        });
        if (!result.ok) {
          flash("error", result.error);
          return;
        }
        setAccount(result.data.account);
        flash("success", "Foto salva na nuvem. Ela aparece em todos os seus aparelhos.");
        router.refresh();
      } catch (err) {
        flash("error", (err as Error).message || "Não conseguimos processar a imagem.");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [flash, router],
  );

  const removePhoto = async () => {
    setBusy("photo-delete");
    const result = await api<{ account: AccountDTO }>("/api/profile/avatar", { method: "DELETE" });
    setBusy(null);
    if (!result.ok) {
      flash("error", result.error);
      return;
    }
    setAccount(result.data.account);
    flash("info", "Foto removida.");
    router.refresh();
  };

  /* ------------------- senha ------------------- */
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy("password");
    setErrors({});

    const result = await api<{ updated: boolean }>("/api/profile/password", {
      method: "POST",
      body: JSON.stringify(pw),
    });
    setBusy(null);

    if (!result.ok) {
      setErrors(result.fields ?? {});
      setNotice({ kind: "error", text: result.error });
      toast.push(result.error, "error");
      return;
    }

    setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
    flash("success", "Senha atualizada. Use a nova senha no próximo login.");
  };

  /* ------------------- sessões ------------------- */
  const reloadSessions = useCallback(async () => {
    const result = await api<{ sessions: SessionDTO[] }>("/api/auth/session");
    if (result.ok && result.data.sessions) setSessions(result.data.sessions);
  }, []);

  useEffect(() => {
    const id = window.setInterval(reloadSessions, 60_000);
    return () => window.clearInterval(id);
  }, [reloadSessions]);

  /* ------------------- conta ------------------- */
  const logout = async () => {
    setBusy("logout");
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const deleteAccount = async () => {
    setBusy("delete");
    const result = await api("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ password: deletePassword }),
    });
    setBusy(null);
    if (!result.ok) {
      flash("error", result.error);
      return;
    }
    toast.push("Conta excluída. Até logo!", "info");
    router.replace("/login");
    router.refresh();
  };

  /* ------------------- atalhos ------------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && tab === "dados") {
        event.preventDefault();
        void saveProfile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const memberSince = formatDate(account.createdAt);
  const activeSessions = sessions.length;

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
            <small>minha conta</small>
          </span>
        </span>

        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggle} type="button" aria-label="Alternar tema" title="Alternar tema">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={logout} disabled={busy === "logout"} type="button">
            {busy === "logout" ? <span className="spinner" /> : null}
            Sair
          </button>
        </div>
      </header>

      <main className="wrap">
        <div className="page-head animate-up">
          <div>
            <span className="eyebrow">
              <span className="dot" />
              Sessão ativa · expira {currentSessionExpiresAt ? relativeTime(currentSessionExpiresAt) : "em 24 h"}
            </span>
            <h1>Olá, {account.name.split(" ")[0]}.</h1>
            <p>Seus dados e sua foto estão salvos no servidor — disponíveis em qualquer aparelho.</p>
          </div>
          <div className="stat-grid animate-up delay-1" style={{ minWidth: 260 }}>
            <div className="stat">
              <span className="k">Conta desde</span>
              <span className="v">{memberSince}</span>
            </div>
            <div className="stat">
              <span className="k">Dispositivos</span>
              <span className="v">
                <CountUp value={activeSessions} />
              </span>
            </div>
          </div>
        </div>

        <div className="layout-2">
          {/* ---------- coluna identidade ---------- */}
          <aside className="stack animate-up delay-1">
            <div className="card card-pad">
              <div className="identity">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  style={{ border: 0, background: "none", padding: 0, cursor: "zoom-in" }}
                  aria-label="Ver foto em tamanho maior"
                >
                  <Avatar name={account.name} src={account.avatar} size="lg" ring />
                </button>
                <div>
                  <h3>{account.name}</h3>
                </div>
                <span className="role">{account.role === "owner" ? "Conta principal" : "Membro"}</span>
                <span className="mail">{account.email}</span>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTab("foto")}>
                    Trocar foto
                  </button>
                  {account.avatar ? (
                    <button className="btn btn-sm" type="button" onClick={() => setPreviewOpen(true)}>
                      Ver
                    </button>
                  ) : null}
                </div>
              </div>

              <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />

              <div className="kv">
                <div className="kv-row">
                  <span className="k">Telefone</span>
                  <span className="v">{account.phone ? formatPhone(account.phone) : "—"}</span>
                </div>
                <div className="kv-row">
                  <span className="k">CPF</span>
                  <span className="v">{account.document ? formatCPF(account.document) : "—"}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Cidade</span>
                  <span className="v">{account.city || "—"}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Nascimento</span>
                  <span className="v">{account.birthDate ? account.birthDate.split("-").reverse().join("/") : "—"}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Último login</span>
                  <span className="v">{relativeTime(account.lastLoginAt)}</span>
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="card-title">
                <h3>No servidor</h3>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-soft)", lineHeight: 1.55 }}>
                Estes dados vivem no PostgreSQL do deploy — não no navegador. Limpar o cache do celular
                não apaga nada: basta entrar com e-mail e senha.
              </p>
            </div>
          </aside>

          {/* ---------- coluna conteúdo ---------- */}
          <section className="stack animate-up delay-2">
            <div className="section-tabs" role="tablist" aria-label="Seções da conta">
              {(
                [
                  { id: "dados", label: "Meus dados" },
                  { id: "foto", label: "Foto" },
                  { id: "seguranca", label: "Segurança" },
                ] as { id: Tab; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === item.id}
                  data-active={tab === item.id}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}

            {tab === "dados" ? (
              <form className="card card-pad section" onSubmit={saveProfile} ref={formRef}>
                <div className="card-title">
                  <h2>Informações pessoais</h2>
                  <span className="muted">{dirty ? "alterações não salvas" : "tudo salvo"}</span>
                </div>

                <div className="grid-2">
                  <Field label="Nome completo" name="name" error={errors.name} required>
                    <div className="control" data-invalid={Boolean(errors.name)}>
                      <input
                        id="p-name"
                        name="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                  </Field>

                  <Field label="E-mail de acesso" name="email" error={errors.email} required>
                    <div className="control" data-invalid={Boolean(errors.email)}>
                      <input
                        id="p-email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid-2">
                  <Field label="Celular" name="phone" error={errors.phone}>
                    <div className="control" data-invalid={Boolean(errors.phone)}>
                      <input
                        id="p-phone"
                        name="phone"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                      />
                    </div>
                  </Field>

                  <Field label="CPF" name="document" error={errors.document}>
                    <div className="control" data-invalid={Boolean(errors.document)}>
                      <input
                        id="p-document"
                        name="document"
                        inputMode="numeric"
                        value={form.document}
                        onChange={(e) => setForm({ ...form, document: formatCPF(e.target.value) })}
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid-2">
                  <Field label="Cidade" name="city" error={errors.city}>
                    <div className="control">
                      <input
                        id="p-city"
                        name="city"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    </div>
                  </Field>

                  <Field label="Nascimento" name="birthDate" error={errors.birthDate}>
                    <div className="control">
                      <input
                        id="p-birthDate"
                        name="birthDate"
                        type="date"
                        value={form.birthDate}
                        onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                      />
                    </div>
                  </Field>
                </div>

                <Field label="Sobre você" name="bio" error={errors.bio} hint={`${form.bio.length}/300 caracteres`}>
                  <div className="control">
                    <textarea
                      id="p-bio"
                      name="bio"
                      maxLength={300}
                      placeholder="Conte em uma linha o que você faz."
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    />
                  </div>
                </Field>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" type="submit" disabled={busy === "profile" || !dirty}>
                    {busy === "profile" ? <span className="spinner" /> : null}
                    {busy === "profile" ? "Salvando..." : "Salvar alterações"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={!dirty || busy === "profile"}
                    onClick={() =>
                      setForm({
                        name: account.name,
                        email: account.email,
                        phone: account.phone ? formatPhone(account.phone) : "",
                        document: account.document ? formatCPF(account.document) : "",
                        city: account.city ?? "",
                        birthDate: account.birthDate ?? "",
                        bio: account.bio ?? "",
                      })
                    }
                  >
                    Desfazer
                  </button>
                  <span className="field-hint" style={{ alignSelf: "center" }}>
                    Ctrl/⌘ + S também salva.
                  </span>
                </div>
              </form>
            ) : null}

            {tab === "foto" ? (
              <div className="card card-pad section">
                <div className="card-title">
                  <h2>Sua foto</h2>
                  <span className="muted">{account.avatarUpdatedAt ? `atualizada ${relativeTime(account.avatarUpdatedAt)}` : "sem foto"}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    gap: 22,
                    alignItems: "center",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <Avatar name={account.name} src={account.avatar} size="lg" ring />
                    <button
                      type="button"
                      className="avatar-edit"
                      onClick={() => fileRef.current?.click()}
                      aria-label="Escolher nova foto"
                      title="Escolher nova foto"
                    >
                      ⇪
                    </button>
                  </div>

                  <div>
                    <p style={{ margin: "0 0 14px", color: "var(--text-soft)", fontSize: 14 }}>
                      JPG, PNG ou WEBP até 15 MB. A imagem é reduzida para 512 px e enviada ao servidor — por
                      isso ela aparece igual em qualquer aparelho.
                    </p>

                    <div
                      className="dropzone"
                      data-drag={dragging}
                      role="button"
                      tabIndex={0}
                      onClick={() => fileRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        const file = event.dataTransfer.files?.[0];
                        if (file) void sendPhoto(file);
                      }}
                    >
                      {uploading ? (
                        <div className="upload-progress">
                          <i />
                        </div>
                      ) : null}
                      <strong>{uploading ? "Enviando para o servidor..." : "Arraste a foto aqui"}</strong>
                      <span>ou clique para escolher do aparelho · câmera do celular também funciona</span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void sendPhoto(file);
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => fileRef.current?.click()}>
                        Escolher arquivo
                      </button>
                      {account.avatar ? (
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={removePhoto}
                          disabled={busy === "photo-delete"}
                        >
                          {busy === "photo-delete" ? <span className="spinner" /> : null}
                          Remover foto
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "seguranca" ? (
              <div className="stack section">
                <form className="card card-pad" onSubmit={changePassword}>
                  <div className="card-title">
                    <h2>Trocar senha</h2>
                  </div>

                  <Field label="Senha atual" name="currentPassword" error={errors.currentPassword} required>
                    <div className="control" data-invalid={Boolean(errors.currentPassword)}>
                      <input
                        id="pw-current"
                        name="currentPassword"
                        type={reveal.current ? "text" : "password"}
                        autoComplete="current-password"
                        value={pw.currentPassword}
                        onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                      />
                      <div className="trail">
                        <button
                          type="button"
                          className="reveal-btn"
                          onClick={() => setReveal({ ...reveal, current: !reveal.current })}
                        >
                          {reveal.current ? "ocultar" : "mostrar"}
                        </button>
                      </div>
                    </div>
                  </Field>

                  <div className="grid-2">
                    <Field label="Nova senha" name="newPassword" error={errors.newPassword} required>
                      <div className="control" data-invalid={Boolean(errors.newPassword)}>
                        <input
                          id="pw-new"
                          name="newPassword"
                          type={reveal.next ? "text" : "password"}
                          autoComplete="new-password"
                          value={pw.newPassword}
                          onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                        />
                        <div className="trail">
                          <button
                            type="button"
                            className="reveal-btn"
                            onClick={() => setReveal({ ...reveal, next: !reveal.next })}
                          >
                            {reveal.next ? "ocultar" : "mostrar"}
                          </button>
                        </div>
                      </div>
                    </Field>

                    <Field label="Repetir nova senha" name="confirmPassword" error={errors.confirmPassword} required>
                      <div className="control" data-invalid={Boolean(errors.confirmPassword)}>
                        <input
                          id="pw-confirm"
                          name="confirmPassword"
                          type={reveal.next ? "text" : "password"}
                          autoComplete="new-password"
                          value={pw.confirmPassword}
                          onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })}
                        />
                      </div>
                    </Field>
                  </div>

                  {pw.newPassword ? (
                    <div className="strength animate-in" data-score={score}>
                      <div className="strength-bar">
                        <span style={{ width: `${Math.max(8, (score + 1) * 20)}%` }} />
                      </div>
                      <span className="strength-label">{passwordLabel(score)}</span>
                    </div>
                  ) : null}

                  <button className="btn btn-primary" type="submit" disabled={busy === "password"} style={{ marginTop: 14 }}>
                    {busy === "password" ? <span className="spinner" /> : null}
                    {busy === "password" ? "Atualizando..." : "Atualizar senha"}
                  </button>
                </form>

                <div className="card card-pad">
                  <div className="card-title">
                    <h2>Dispositivos conectados</h2>
                    <span className="muted">{activeSessions} ativo(s)</span>
                  </div>

                  {sessions.length === 0 ? (
                    <Skeleton lines={2} />
                  ) : (
                    <ul className="session-list">
                      {sessions.map((item, index) => {
                        const isCurrent = index === sessions.length - 1;
                        return (
                          <li key={item.id ?? `${item.createdAt}-${index}`} className="session-item">
                            <span aria-hidden="true" style={{ fontSize: 20 }}>
                              {/iPhone|Android/.test(item.userAgent ?? "") ? "▤" : "▭"}
                            </span>
                            <div className="meta">
                              <div className="ua">{deviceLabel(item.userAgent)}</div>
                              <div className="when">
                                início {formatDateTime(item.createdAt)} · expira {formatDateTime(item.expiresAt)}
                              </div>
                            </div>
                            {isCurrent ? <span className="badge">este</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="field-hint" style={{ marginTop: 12 }}>
                    Cada login cria uma sessão de 24 horas. Fechar o navegador não encerra a sessão; &ldquo;Sair&rdquo; encerra.
                  </p>
                </div>

                <div className="card card-pad">
                  <div className="card-title">
                    <h2>Excluir conta</h2>
                  </div>
                  <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--text-soft)" }}>
                    Apaga sua conta, a foto e todas as sessões do banco de dados. Não dá para desfazer.
                  </p>
                  <button className="btn btn-danger" type="button" onClick={() => setDeleteOpen(true)}>
                    Excluir minha conta
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      <footer className="footer">
        <span>Palco · conta salva no PostgreSQL</span>
        <span>
          Sessão expira {currentSessionExpiresAt ? formatDateTime(currentSessionExpiresAt) : "em 24 h"}
        </span>
      </footer>

      <Modal open={previewOpen && Boolean(account.avatar)} title={account.name} onClose={() => setPreviewOpen(false)}>
        <div style={{ display: "grid", placeItems: "center", gap: 14, padding: "6px 0 4px" }}>
          <Avatar name={account.name} src={account.avatar} size="lg" ring />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Foto salva {account.avatarUpdatedAt ? relativeTime(account.avatarUpdatedAt) : "—"} · visível em todos os aparelhos
          </span>
        </div>
      </Modal>

      <Modal open={deleteOpen} title="Excluir conta" onClose={() => setDeleteOpen(false)}>
        <p>Digite sua senha para confirmar. Esta ação remove seus dados do servidor.</p>
        <div className="control">
          <input
            type="password"
            placeholder="sua senha"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setDeleteOpen(false)}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={deleteAccount}
            disabled={busy === "delete" || !deletePassword}
          >
            {busy === "delete" ? <span className="spinner" /> : null}
            Excluir definitivamente
          </button>
        </div>
      </Modal>
    </div>
  );
}
