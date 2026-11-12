"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Receipt, Package, Boxes, Users, Truck, ClipboardList,
  FileText, RotateCcw, Wallet, Landmark, CreditCard, BarChart3, FileCheck2, ShieldCheck,
  Settings, ScrollText, ChevronLeft, ChevronRight, Search, Bell, Sun, Moon, LogOut, Menu,
  X, UserCircle2, Keyboard, CheckCheck, AlertTriangle, CircleAlert, Info, CircleCheck, Sparkles,
} from "lucide-react";
import { cn, initials, dateTimeBR } from "@/lib/utils";
import { NAVIGATION, type NavItem } from "@/lib/navigation";
import type { SessionUser } from "@/server/auth/session";
import { useTheme } from "./theme-provider";
import { OrionMark } from "@/components/brand/orion-mark";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal, Badge } from "@/components/ui/primitives";
import { GlobalSearch } from "./global-search";
import { ShortcutsModal } from "./shortcuts-modal";
import { toast } from "sonner";

const ICONS: Record<NavItem["icon"], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  sales: Receipt,
  products: Package,
  stock: Boxes,
  customers: Users,
  suppliers: Truck,
  purchases: ClipboardList,
  quotes: FileText,
  returns: RotateCcw,
  cash: Wallet,
  finance: Landmark,
  credit: CreditCard,
  reports: BarChart3,
  fiscal: FileCheck2,
  users: ShieldCheck,
  settings: Settings,
  audit: ScrollText,
};

type Notification = {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "DANGER" | "SUCCESS";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export function AppShell({
  user,
  appName,
  companyName,
  logoUrl,
  demoMode = false,
  children,
}: {
  user: SessionUser;
  appName: string;
  companyName: string;
  logoUrl: string | null;
  demoMode?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolved, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [cashOpen, setCashOpen] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem("passarela:sidebar");
    if (stored === "collapsed") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("passarela:sidebar", !c ? "collapsed" : "expanded");
      return !c;
    });
  }

  const loadNotifications = React.useCallback(async () => {
    try {
      const res = await api.get<{ items: Notification[]; unread: number }>("/api/notifications");
      setNotifications(res.items);
      setUnread(res.unread);
    } catch {
      /* silencioso */
    }
  }, []);

  React.useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), 90_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  React.useEffect(() => {
    api
      .get<{ open: boolean }>("/api/cash/status")
      .then((r) => setCashOpen(r.open))
      .catch(() => undefined);
  }, [pathname]);

  // Atalhos de teclado globais
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        router.push("/pdv");
        return;
      }
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setNotifOpen(false);
        setUserMenuOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  React.useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  async function markAllRead() {
    await api.post("/api/notifications/read-all");
    setNotifications((n) => n.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
  }

  const visibleNavigation = React.useMemo(
    () =>
      NAVIGATION.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permission || user.permissions.includes(item.permission)),
      })).filter((group) => group.items.length > 0),
    [user.permissions],
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const currentGroup = visibleNavigation.find((g) => g.items.some((i) => isActive(i.href)));
  const currentItem = currentGroup?.items.find((i) => isActive(i.href));

  return (
    <div className="flex min-h-dvh bg-[var(--bg-app)]">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)] transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-60",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          visibleNavigation={visibleNavigation}
          isActive={isActive}
          appName={appName}
          logoUrl={logoUrl}
          companyName={companyName}
          cashOpen={cashOpen}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 flex w-64 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)]">
            <div className="flex items-center justify-end p-2">
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-[var(--bg-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              collapsed={false}
              visibleNavigation={visibleNavigation}
              isActive={isActive}
              appName={appName}
              logoUrl={logoUrl}
              companyName={companyName}
              cashOpen={cashOpen}
            />
          </aside>
        </div>
      )}

      <div className={cn("flex min-w-0 flex-1 flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-60")}>
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/85 px-3 backdrop-blur-md sm:px-5">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="truncate text-xs font-medium text-[var(--text-muted)]">
              {currentGroup?.title}
            </span>
            {currentItem && (
              <>
                <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  {currentItem.label}
                </span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="group flex h-9 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] px-2.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] sm:w-56"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Buscar produtos, clientes…</span>
              <span className="kbd ml-auto hidden sm:inline-flex">⌘K</span>
            </button>

            <button
              onClick={() => setShortcutsOpen(true)}
              className="hidden rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] sm:block"
              title="Atalhos de teclado (?)"
            >
              <Keyboard className="h-4 w-4" />
            </button>

            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setUserMenuOpen(false);
                }}
                className="relative rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                aria-label="Notificações"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="animate-scale-in absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl">
                    <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">Notificações</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {unread > 0 ? `${unread} não lida(s)` : "Tudo em dia"}
                        </p>
                      </div>
                      {unread > 0 && (
                        <button
                          onClick={() => void markAllRead()}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> Marcar lidas
                        </button>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
                          Nenhuma notificação no momento.
                        </div>
                      ) : (
                        notifications.map((n) => {
                          const Icon =
                            n.severity === "DANGER"
                              ? CircleAlert
                              : n.severity === "WARNING"
                                ? AlertTriangle
                                : n.severity === "SUCCESS"
                                  ? CircleCheck
                                  : Info;
                          const tone =
                            n.severity === "DANGER"
                              ? "text-[var(--danger)]"
                              : n.severity === "WARNING"
                                ? "text-[var(--warning)]"
                                : n.severity === "SUCCESS"
                                  ? "text-[var(--success)]"
                                  : "text-[var(--info)]";
                          return (
                            <button
                              key={n.id}
                              onClick={async () => {
                                await api.post(`/api/notifications/${n.id}/read`).catch(() => undefined);
                                setNotifications((list) =>
                                  list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
                                );
                                setUnread((u) => Math.max(0, u - (n.isRead ? 0 : 1)));
                              }}
                              className={cn(
                                "flex w-full items-start gap-3 border-b border-[var(--border-default)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--bg-muted)]",
                                !n.isRead && "bg-[var(--accent-soft)]/40",
                              )}
                            >
                              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                                  {n.message}
                                </p>
                                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                                  {dateTimeBR(n.createdAt)}
                                </p>
                              </div>
                              {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
              aria-label="Alternar tema"
              title={resolved === "dark" ? "Tema claro" : "Tema escuro"}
            >
              {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                onClick={() => {
                  setUserMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-[var(--bg-muted)]"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-8 w-8 rounded-lg object-cover ring-1 ring-[var(--border-default)]"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[11px] font-bold text-[var(--accent-contrast)]">
                    {initials(user.name)}
                  </span>
                )}
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[120px] truncate text-xs font-semibold leading-tight">
                    {user.name}
                  </span>
                  <span className="block text-[10px] leading-tight text-[var(--text-muted)]">
                    {user.roleLabel}
                  </span>
                </span>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="animate-scale-in absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl">
                    <div className="flex items-center gap-3 border-b border-[var(--border-default)] px-4 py-3">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-[var(--accent-contrast)]">
                          {initials(user.name)}
                        </span>
                      )}
                      <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{user.email}</p>
                      <Badge tone="gold" className="mt-1.5">
                        {user.roleLabel}
                      </Badge>
                      </div>
                    </div>
                    <div className="p-1">
                      <Link
                        href="/perfil"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-[var(--bg-muted)]"
                      >
                        <UserCircle2 className="h-3.5 w-3.5" /> Meu perfil e senha
                      </Link>
                      <button
                        onClick={() => void logout()}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sair do sistema
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {demoMode && (
          <div className="no-print border-b border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-1.5 text-center sm:px-5">
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-[var(--accent)]">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>
                <strong>Modo demonstração</strong> — acesso automático como {user.name} ({user.roleLabel}).
                Desative com <code className="rounded bg-black/10 px-1 font-mono">DEMO_AUTO_LOGIN=false</code> para
                exigir login.
              </span>
            </p>
          </div>
        )}

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5">{children}</main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {user.mustChangePassword && <ForcePasswordChange />}

      <CashWarningBanner open={cashOpen} />
    </div>
  );
}

function SidebarContent({
  collapsed,
  visibleNavigation,
  isActive,
  appName,
  logoUrl,
  companyName,
  cashOpen,
  onToggleCollapse,
}: {
  collapsed: boolean;
  visibleNavigation: Array<{ title: string; items: NavItem[] }>;
  isActive: (href: string) => boolean;
  appName: string;
  logoUrl: string | null;
  companyName: string;
  cashOpen: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <>
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-[var(--border-default)] px-4", collapsed && "justify-center px-0")}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName} className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          // Sem logo própria da loja: usa o símbolo da marca (três estrelas),
          // que já é a identidade padrão de todo cadastro novo.
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
            <OrionMark size={20} color="var(--accent)" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide">
              {appName}
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">{companyName}</p>
          </div>
        )}
        {!collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
            aria-label="Recolher menu"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="mx-auto mt-2 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
          aria-label="Expandir menu"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleNavigation.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_2px_0_0_var(--accent)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge === "cash" && cashOpen && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--success)]" title="Caixa aberto" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-[var(--border-default)] p-3">
          <div className="rounded-xl bg-[var(--accent-soft)] p-3">
            <p className="text-[11px] font-semibold text-[var(--accent)]">Atalhos rápidos</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
              <span className="kbd">F2</span> nova venda · <span className="kbd">⌘K</span> busca global
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ForcePasswordChange() {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword: current, newPassword: next });
      toast.success("Senha alterada com sucesso.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => undefined}
      closeOnBackdrop={false}
      title="Alteração de senha obrigatória"
      description="Por segurança, defina uma nova senha antes de continuar."
      size="sm"
      footer={
        <Button onClick={(e) => void submit(e as unknown as React.FormEvent)} loading={loading}>
          Alterar senha
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="text-xs font-medium text-[var(--danger)]">{error}</p>}
        <input type="password" className="field" placeholder="Senha atual" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <input type="password" className="field" placeholder="Nova senha (mín. 8 caracteres)" value={next} onChange={(e) => setNext(e.target.value)} required />
        <input type="password" className="field" placeholder="Confirmar nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </form>
    </Modal>
  );
}

function CashWarningBanner({ open }: { open: boolean }) {
  const pathname = usePathname();
  if (!open || pathname.startsWith("/caixa") || pathname.startsWith("/pdv")) return null;
  return (
    <div className="no-print fixed bottom-3 left-1/2 z-20 -translate-x-1/2">
      <Link
        href="/caixa"
        className="flex items-center gap-2 rounded-full border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-2 text-[11px] font-semibold text-[var(--warning)] shadow-lg"
      >
        <Wallet className="h-3.5 w-3.5" />
        Caixa aberto — clique para conferir
      </Link>
    </div>
  );
}
