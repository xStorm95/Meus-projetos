"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Users, Phone, MessageCircle, AlertTriangle, Crown, UserX, Cake, UserCheck,
  Download, Star, Ban, TrendingUp, FileUp, FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ImportCustomersDialog } from "@/components/customers/import-customers-dialog";

type CustomerRow = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  birthDate: string | null;
  city: string | null;
  state: string | null;
  creditLimit: string;
  isActive: boolean;
  purchases: number;
  totalSpent: string;
  lastPurchase: string | null;
  debt: string;
  overdueDebt: string;
  credits: string;
  classifications: string[];
};

const TAG_CONFIG: Record<string, { label: string; tone: "gold" | "success" | "warning" | "danger" | "info" | "neutral" | "rose"; icon: React.ReactNode }> = {
  NOVO: { label: "Novo", tone: "info", icon: <Star className="h-2.5 w-2.5" /> },
  RECORRENTE: { label: "Recorrente", tone: "success", icon: <UserCheck className="h-2.5 w-2.5" /> },
  VIP: { label: "VIP", tone: "gold", icon: <Crown className="h-2.5 w-2.5" /> },
  INATIVO: { label: "Inativo", tone: "neutral", icon: <UserX className="h-2.5 w-2.5" /> },
  INADIMPLENTE: { label: "Crediário aberto", tone: "danger", icon: <AlertTriangle className="h-2.5 w-2.5" /> },
  ANIVERSARIANTE: { label: "Aniversariante", tone: "rose", icon: <Cake className="h-2.5 w-2.5" /> },
};

export function CustomersView({
  initial,
  filters,
  canCreate,
  canExport,
  summary,
}: {
  initial: { items: CustomerRow[]; total: number; page: number; pageSize: number };
  filters: { search: string; classification: string; birthdaysMonth: string };
  canCreate: boolean;
  canExport: boolean;
  summary: { total: number; vip: number; inactive: number; delinquent: number; birthdays: number };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(filters.search);
  const [importOpen, setImportOpen] = React.useState(false);

  function applyFilters(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === "ALL") next.delete(key);
      else next.set(key, String(value));
    }
    if (!("page" in patch)) next.delete("page");
    router.push(`/clientes?${next.toString()}`);
  }

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (search !== filters.search) applyFilters({ search });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function exportar(formato: "csv" | "xlsx") {
    try {
      await downloadFile("/api/customers/export", {
        format: formato,
        search: filters.search,
        classification: filters.classification,
      });
      toast.success(formato === "xlsx" ? "Planilha Excel gerada." : "Arquivo CSV gerado.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Cliente",
      sortable: true,
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">
            {c.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
          </span>
          <div className="min-w-0">
            <Link href={`/clientes/${c.id}`} className="block truncate text-[13px] font-semibold hover:text-[var(--accent)]">
              {c.name}
            </Link>
            <div className="flex flex-wrap items-center gap-1">
              {c.phone && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                  <Phone className="h-2.5 w-2.5" /> {formatPhone(c.phone)}
                </span>
              )}
              {c.whatsapp && <MessageCircle className="h-2.5 w-2.5 text-[var(--success)]" />}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "tags",
      header: "Classificação",
      hiddenOnMobile: true,
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.classifications.length === 0 && <span className="text-[10px] text-[var(--text-muted)]">—</span>}
          {c.classifications.slice(0, 2).map((t) => {
            const cfg = TAG_CONFIG[t];
            if (!cfg) return null;
            return (
              <Badge key={t} tone={cfg.tone} className="gap-0.5 px-1.5 text-[9px]">
                {cfg.icon} {cfg.label}
              </Badge>
            );
          })}
          {c.classifications.length > 2 && (
            <Badge tone="neutral" className="px-1.5 text-[9px]">+{c.classifications.length - 2}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "purchases",
      header: "Compras",
      align: "center",
      sortable: true,
      sortValue: (c) => c.purchases,
      cell: (c) => <span className="text-xs tabular-nums">{num(c.purchases)}</span>,
    },
    {
      key: "totalSpent",
      header: "Total gasto",
      align: "right",
      sortable: true,
      sortValue: (c) => Number(c.totalSpent),
      cell: (c) => <span className="text-xs font-semibold tabular-nums">{brl(c.totalSpent)}</span>,
    },
    {
      key: "lastPurchase",
      header: "Última compra",
      hiddenOnMobile: true,
      sortable: true,
      sortValue: (c) => c.lastPurchase ?? "",
      cell: (c) => (
        <span className="text-[11px] text-[var(--text-secondary)]">
          {c.lastPurchase ? dateBR(c.lastPurchase) : "Nunca comprou"}
        </span>
      ),
    },
    {
      key: "debt",
      header: "Crediário",
      align: "right",
      cell: (c) => {
        const debt = Number(c.debt);
        const overdue = Number(c.overdueDebt);
        if (debt <= 0) return <span className="text-xs text-[var(--text-muted)]">—</span>;
        return (
          <div className="text-right">
            <p className={cn("text-xs font-semibold tabular-nums", overdue > 0 && "text-[var(--danger)]")}>
              {brl(debt)}
            </p>
            {overdue > 0 && <p className="text-[9px] font-medium text-[var(--danger)]">{brl(overdue)} vencido</p>}
          </div>
        );
      },
    },
    {
      key: "credits",
      header: "Crédito",
      align: "right",
      hiddenOnMobile: true,
      cell: (c) =>
        Number(c.credits) > 0 ? (
          <Badge tone="success">{brl(c.credits)}</Badge>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">—</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <ImportCustomersDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Clientes
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(initial.total)} cliente(s) · CRM com histórico, crediário e classificação
          </p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={() => void exportar("csv")}
                title="Baixar CSV (abre no Excel e em qualquer planilha)"
              >
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                onClick={() => void exportar("xlsx")}
                title="Baixar planilha Excel com números somáveis"
              >
                Excel
              </Button>
            </>
          )}
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileUp className="h-3.5 w-3.5" />}
              onClick={() => setImportOpen(true)}
            >
              Importar
            </Button>
          )}
          <Link href="/clientes/relatorios">
            <Button variant="outline" size="sm" leftIcon={<TrendingUp className="h-3.5 w-3.5" />}>
              Relatórios CRM
            </Button>
          </Link>
          {canCreate && (
            <Link href="/clientes/novo">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />}>Novo cliente</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard icon={<Users className="h-3.5 w-3.5" />} label="Base total" value={num(summary.total)} />
        <StatCard icon={<Crown className="h-3.5 w-3.5" />} label="VIPs" value={num(summary.vip)} tone="gold" />
        <StatCard icon={<UserX className="h-3.5 w-3.5" />} label="Inativos 90d" value={num(summary.inactive)} tone="neutral" />
        <StatCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Crediário aberto" value={num(summary.delinquent)} tone="danger" />
        <StatCard icon={<Cake className="h-3.5 w-3.5" />} label="Aniversariantes" value={num(summary.birthdays)} tone="rose" />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Buscar" className="min-w-[240px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Nome, CPF, telefone ou e-mail..." />
          </Field>
          <Field label="Classificação" className="w-44">
            <Select
              value={filters.classification}
              onChange={(e) => applyFilters({ classification: e.target.value })}
            >
              <option value="ALL">Todos</option>
              <option value="NEW">Clientes novos</option>
              <option value="RECURRING">Recorrentes</option>
              <option value="VIP">VIP</option>
              <option value="INACTIVE">Inativos (90 dias)</option>
              <option value="DELINQUENT">Com crediário em aberto</option>
            </Select>
          </Field>
          <Field label="Mês de aniversário" className="w-40">
            <Select
              value={filters.birthdaysMonth}
              onChange={(e) => applyFilters({ birthdaysMonth: e.target.value })}
            >
              <option value="">Todos</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <DataTable
        data={initial.items}
        columns={columns}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => router.push(`/clientes/${c.id}`)}
        pagination={{
          page: initial.page,
          pageSize: initial.pageSize,
          total: initial.total,
          onPageChange: (page) => applyFilters({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum cliente encontrado"
            description={
              filters.search || filters.classification
                ? "Ajuste os filtros ou tente outro termo."
                : "Cadastre o primeiro cliente para começar."
            }
            action={
              canCreate ? (
                <Link href="/clientes/novo">
                  <Button leftIcon={<Plus className="h-4 w-4" />}>Cadastrar cliente</Button>
                </Link>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "gold" | "danger" | "rose" | "neutral";
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg",
          tone === "gold" && "bg-[var(--accent-soft)] text-[var(--accent)]",
          tone === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
          tone === "rose" && "bg-[var(--rose-100)] text-[var(--rose-700)]",
          tone === "neutral" && "bg-[var(--bg-muted)] text-[var(--text-secondary)]",
          !tone && "bg-[var(--bg-muted)] text-[var(--text-secondary)]",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        <p className="text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

void Ban;
