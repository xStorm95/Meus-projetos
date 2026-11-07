"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus, ShieldCheck, KeyRound, Power, Save, Search, Users, MonitorSmartphone, Trash2, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { cn, dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert, Tabs } from "@/components/ui/primitives";
import { Field, Input, Select, SearchInput, Switch } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  phone: string | null;
  commissionRate: string;
  monthlyGoal: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  extraPermissions: string[] | null;
  deniedPermissions: string[] | null;
  createdAt: string;
  salesCount: number;
  permissions: string[];
  basePermissions: string[];
};

type SessionRow = {
  id: string;
  userName: string;
  userEmail: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};

type Role = { value: string; label: string; permissionCount: number };
type Perm = { key: string; label: string };

const PERMISSION_GROUPS: Record<string, string> = {
  products: "Produtos",
  stock: "Estoque",
  sales: "Vendas",
  cash: "Caixa",
  finance: "Financeiro",
  credit: "Crediário",
  customers: "Clientes",
  suppliers: "Fornecedores",
  purchases: "Compras",
  quotes: "Orçamentos",
  returns: "Trocas/Devoluções",
  reports: "Relatórios",
  fiscal: "Fiscal",
  users: "Usuários",
  settings: "Configurações",
  audit: "Auditoria",
  backup: "Backup",
};

export function UsersView({
  users,
  roles,
  permissionCatalog,
  sessions,
  currentUserId,
  canManage,
}: {
  users: UserRow[];
  roles: Role[];
  permissionCatalog: Perm[];
  sessions: SessionRow[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"USERS" | "PERMISSIONS" | "SESSIONS">("USERS");
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [permTarget, setPermTarget] = React.useState<UserRow | null>(null);
  const [pwTarget, setPwTarget] = React.useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "SELLER",
    phone: "",
    commissionRate: 0,
    monthlyGoal: 0,
    isActive: true,
  });

  const [grants, setGrants] = React.useState<string[]>([]);
  const [denies, setDenies] = React.useState<string[]>([]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  }, [users, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "SELLER", phone: "", commissionRate: 0, monthlyGoal: 0, isActive: true });
    setFormOpen(true);
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      phone: user.phone ?? "",
      commissionRate: Number(user.commissionRate),
      monthlyGoal: Number(user.monthlyGoal),
      isActive: user.isActive,
    });
    setFormOpen(true);
  }

  async function save() {
    if (form.name.trim().length < 3) return toast.error("Informe o nome completo.");
    if (!editing && form.password.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres.");
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/users/${editing.id}`, {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone || null,
          commissionRate: form.commissionRate,
          monthlyGoal: form.monthlyGoal,
          isActive: form.isActive,
        });
        toast.success("Usuário atualizado.");
      } else {
        await api.post("/api/users", {
          ...form,
          phone: form.phone || null,
          mustChangePassword: true,
        });
        toast.success("Usuário criado. Ele deverá alterar a senha no primeiro acesso.");
      }
      setFormOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openPermissions(user: UserRow) {
    setPermTarget(user);
    setGrants(user.extraPermissions ?? []);
    setDenies(user.deniedPermissions ?? []);
  }

  async function savePermissions() {
    if (!permTarget) return;
    setSaving(true);
    try {
      await api.patch(`/api/users/${permTarget.id}`, {
        extraPermissions: grants,
        deniedPermissions: denies,
      });
      toast.success("Permissões atualizadas.");
      setPermTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!pwTarget) return;
    if (newPassword.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres.");
    setSaving(true);
    try {
      await api.post(`/api/users/${pwTarget.id}/reset-password`, { password: newPassword });
      toast.success("Senha redefinida. O usuário deverá alterá-la no próximo acesso.");
      setPwTarget(null);
      setNewPassword("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: UserRow) {
    if (user.id === currentUserId && user.isActive) {
      return toast.error("Você não pode desativar o próprio usuário.");
    }
    try {
      await api.post(`/api/users/${user.id}/active`, { isActive: !user.isActive });
      toast.success(user.isActive ? "Usuário desativado." : "Usuário reativado.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function revoke(session: SessionRow) {
    try {
      await api.delete(`/api/sessions/${session.id}`);
      toast.success("Sessão revogada.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "Usuário",
      sortable: true,
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-muted)] text-[11px] font-bold">
            {u.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">
              {u.name}
              {u.id === currentUserId && <span className="ml-1 text-[9px] text-[var(--text-muted)]">(você)</span>}
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Perfil",
      sortable: true,
      sortValue: (u) => u.role,
      cell: (u) => <Badge tone={u.role === "ADMIN" ? "danger" : u.role === "MANAGER" ? "warning" : "info"}>{u.roleLabel}</Badge>,
    },
    {
      key: "permissions",
      header: "Permissões",
      hiddenOnMobile: true,
      cell: (u) => (
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {u.permissions.length} ativa(s)
          {(u.deniedPermissions?.length ?? 0) > 0 && (
            <Badge tone="danger" className="ml-1">
              -{u.deniedPermissions?.length}
            </Badge>
          )}
          {(u.extraPermissions?.length ?? 0) > 0 && (
            <Badge tone="success" className="ml-1">
              +{u.extraPermissions?.length}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "sales",
      header: "Vendas",
      align: "right",
      sortable: true,
      sortValue: (u) => u.salesCount,
      hiddenOnMobile: true,
      cell: (u) => <span className="text-[11px] tabular-nums">{num(u.salesCount)}</span>,
    },
    {
      key: "lastLogin",
      header: "Último acesso",
      hiddenOnMobile: true,
      cell: (u) => (
        <span className="text-[11px] text-[var(--text-muted)]">
          {u.lastLoginAt ? dateTimeBR(u.lastLoginAt) : "nunca"}
          {u.lockedUntil && <Badge tone="danger" className="ml-1">bloqueado</Badge>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (u) => <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Ativo" : "Inativo"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (u) => (
        <div className="flex justify-end gap-0.5">
          {canManage && (
            <>
              <Button variant="ghost" size="icon-sm" title="Editar" onClick={() => openEdit(u)}>
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Permissões" onClick={() => openPermissions(u)}>
                <ShieldCheck className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Redefinir senha" onClick={() => { setPwTarget(u); setNewPassword(""); }}>
                <KeyRound className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={u.isActive ? "Desativar" : "Reativar"}
                className={u.isActive ? "text-[var(--danger)]" : "text-[var(--success)]"}
                onClick={() => void toggleActive(u)}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const groupedCatalog = React.useMemo(() => {
    const groups: Record<string, Perm[]> = {};
    for (const perm of permissionCatalog) {
      const prefix = perm.key.split(".")[0] ?? "outros";
      const label = PERMISSION_GROUPS[prefix] ?? prefix;
      groups[label] = groups[label] ?? [];
      groups[label].push(perm);
    }
    return groups;
  }, [permissionCatalog]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Usuários e permissões
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(users.length)} usuário(s) · {num(users.filter((u) => u.isActive).length)} ativo(s)
          </p>
        </div>
        {canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Novo usuário
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "USERS", label: "Equipe", count: users.length },
          { value: "PERMISSIONS", label: "Matriz de permissões" },
          { value: "SESSIONS", label: "Sessões ativas", count: sessions.length },
        ]}
      />

      {tab === "USERS" && (
        <>
          <Card className="p-3">
            <Field label="Buscar" className="max-w-md">
              <SearchInput value={search} onChange={setSearch} placeholder="Nome ou e-mail..." />
            </Field>
          </Card>
          <DataTable
            data={filtered}
            columns={columns}
            keyExtractor={(u) => u.id}
            emptyState={<EmptyState icon={<Users className="h-6 w-6" />} title="Nenhum usuário" description="Cadastre a equipe e defina os perfis de acesso." />}
          />
        </>
      )}

      {tab === "PERMISSIONS" && (
        <>
          <Alert tone="info" title="Como as permissões funcionam">
            Cada perfil concede um conjunto base de permissões. O administrador pode conceder permissões extras ou
            negar permissões específicas em <strong>Equipe → Permissões</strong>. A negação sempre prevalece.
          </Alert>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[var(--bg-muted)] text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--bg-muted)] px-3 py-2 text-left">Permissão</th>
                  {roles.map((role) => (
                    <th key={role.value} className="px-2 py-2 text-center">{role.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedCatalog).map(([group, perms]) => (
                  <React.Fragment key={group}>
                    <tr className="bg-[var(--bg-muted)]/60">
                      <td colSpan={roles.length + 1} className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                        {group}
                      </td>
                    </tr>
                    {perms.map((perm) => (
                      <tr key={perm.key} className="border-t border-[var(--border-subtle)]">
                        <td className="sticky left-0 z-10 bg-[var(--bg-surface)] px-3 py-1">
                          <p className="text-[11px]">{perm.label}</p>
                          <p className="font-mono text-[9px] text-[var(--text-muted)]">{perm.key}</p>
                        </td>
                        {roles.map((role) => {
                          const has = users.some((u) => u.role === role.value && u.basePermissions.includes(perm.key));
                          return (
                            <td key={role.value} className="px-2 py-1 text-center">
                              {role.value === "ADMIN" || has ? (
                                <Check className="mx-auto h-3.5 w-3.5 text-[var(--success)]" />
                              ) : (
                                <X className="mx-auto h-3.5 w-3.5 text-[var(--border-default)]" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === "SESSIONS" && (
        <Card className="overflow-hidden">
          {sessions.length === 0 ? (
            <EmptyState icon={<MonitorSmartphone className="h-6 w-6" />} title="Nenhuma sessão ativa" description="As sessões são criadas no login e expiram automaticamente." />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center gap-3 px-4 py-2.5">
                  <MonitorSmartphone className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold">{session.userName}</p>
                    <p className="truncate text-[10px] text-[var(--text-muted)]">
                      {session.userEmail} · {session.ip ?? "IP desconhecido"} · expira {dateTimeBR(session.expiresAt)}
                    </p>
                  </div>
                  <span className="hidden max-w-[220px] truncate text-[10px] text-[var(--text-muted)] sm:block">
                    {session.userAgent ?? "—"}
                  </span>
                  {canManage && (
                    <Button variant="ghost" size="icon-sm" title="Revogar sessão" onClick={() => void revoke(session)}>
                      <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* criar/editar usuário */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar usuário" : "Novo usuário"}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void save()}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome completo" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="E-mail" required>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Perfil" required>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>{r.label} ({r.permissionCount} permissões)</option>
              ))}
            </Select>
          </Field>
          {!editing && (
            <Field label="Senha inicial" required hint="Mínimo de 8 caracteres com letras e números" className="sm:col-span-2">
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Comissão (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.commissionRate}
              onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })}
            />
          </Field>
          <Field label="Meta mensal (R$)">
            <Input
              type="number"
              min={0}
              value={form.monthlyGoal}
              onChange={(e) => setForm({ ...form, monthlyGoal: Number(e.target.value) })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Switch
              checked={form.isActive}
              onChange={(v) => setForm({ ...form, isActive: v })}
              label="Usuário ativo"
              description="Usuários inativos não conseguem fazer login."
            />
          </div>
        </div>
      </Modal>

      {/* permissões */}
      <Modal
        open={Boolean(permTarget)}
        onClose={() => setPermTarget(null)}
        title="Permissões individuais"
        description={permTarget ? `${permTarget.name} · ${permTarget.roleLabel}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPermTarget(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void savePermissions()}>Salvar permissões</Button>
          </>
        }
      >
        {permTarget && (
          <div className="space-y-3">
            <Alert tone="warning">
              Use com parcimônia. Conceder dá acesso extra além do perfil; negar remove um acesso mesmo que o perfil
              permita. A negação prevalece sobre a concessão.
            </Alert>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {Object.entries(groupedCatalog).map(([group, perms]) => (
                <div key={group}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">{group}</p>
                  <div className="space-y-1">
                    {perms.map((perm) => {
                      const isBase = permTarget.basePermissions.includes(perm.key) || permTarget.role === "ADMIN";
                      const isGranted = grants.includes(perm.key) || isBase;
                      const isDenied = denies.includes(perm.key);
                      return (
                        <div
                          key={perm.key}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
                            isDenied ? "border-[var(--danger)]/30 bg-[var(--danger-soft)]" : "border-[var(--border-subtle)]",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium">{perm.label}</p>
                            <p className="font-mono text-[9px] text-[var(--text-muted)]">
                              {perm.key} {isBase ? "· do perfil" : "· extra"}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setDenies((prev) => prev.filter((p) => p !== perm.key));
                                if (!isBase) setGrants((prev) => (prev.includes(perm.key) ? prev : [...prev, perm.key]));
                              }}
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-semibold",
                                isGranted && !isDenied
                                  ? "bg-[var(--success-soft)] text-[var(--success)]"
                                  : "bg-[var(--bg-muted)] text-[var(--text-muted)]",
                              )}
                            >
                              Permitir
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGrants((prev) => prev.filter((p) => p !== perm.key));
                                if (!denies.includes(perm.key)) setDenies((prev) => [...prev, perm.key]);
                              }}
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-semibold",
                                isDenied
                                  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                                  : "bg-[var(--bg-muted)] text-[var(--text-muted)]",
                              )}
                            >
                              Negar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* redefinir senha */}
      <Modal
        open={Boolean(pwTarget)}
        onClose={() => setPwTarget(null)}
        title="Redefinir senha"
        description={pwTarget?.name}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPwTarget(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void resetPassword()}>Redefinir</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="info">
            A nova senha força a troca no próximo acesso do usuário. Nenhuma senha é exibida em tela ou armazenada em
            texto puro.
          </Alert>
          <Field label="Nova senha" required hint="Mínimo 8 caracteres, com letras e números">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
