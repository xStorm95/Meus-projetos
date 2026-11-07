"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ScrollText, Search, Download, ChevronRight, ShieldAlert, Clock } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, downloadFile } from "@/lib/api-client";
import { dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, Select, SearchInput } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";

type AuditRow = {
  id: string;
  createdAt: string;
  userName: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
};

const ACTION_TONES: Array<{ match: RegExp; tone: "success" | "danger" | "warning" | "info" | "neutral" }> = [
  { match: /CANCEL|DELETE|ANONYMIZE|DENY|REVOKE|LOSS|DAMAGE/, tone: "danger" },
  { match: /CREATE|RECEIVE|PAY|RECEIPT|ENTRY|CLOSE|AUTHORIZE/, tone: "success" },
  { match: /UPDATE|ADJUST|TRANSFER|SETTINGS|BRANDING/, tone: "warning" },
  { match: /LOGIN|LOGOUT|SESSION/, tone: "info" },
];

function toneFor(action: string) {
  return ACTION_TONES.find((t) => t.match.test(action))?.tone ?? "neutral";
}

export function AuditView({
  data,
  facets,
  filters,
}: {
  data: {
    items: AuditRow[];
    total: number;
    totals: { today: number; users: number };
    page: number;
    pageSize: number;
  };
  facets: {
    actions: Array<{ value: string; total: number }>;
    entities: Array<{ value: string; total: number }>;
    users: Array<{ id: string; name: string }>;
  };
  filters: { search: string; action: string; entity: string; userId: string; from: string; to: string };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState(filters.search);
  const [detail, setDetail] = React.useState<AuditRow | null>(null);

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "ALL") continue;
      next.set(k, String(v));
    }
    router.push(`/auditoria?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) navigate({ search, page: undefined });
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const columns: Column<AuditRow>[] = [
    {
      key: "when",
      header: "Quando",
      sortable: true,
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-[11px] tabular-nums">{dateTimeBR(r.createdAt)}</span>
      ),
    },
    {
      key: "user",
      header: "Usuário",
      sortable: true,
      sortValue: (r) => r.userName ?? "",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium">{r.userName ?? "sistema"}</p>
          <p className="text-[9px] text-[var(--text-muted)]">{r.ip ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "action",
      header: "Ação",
      sortable: true,
      sortValue: (r) => r.action,
      cell: (r) => <Badge tone={toneFor(r.action)}>{r.action}</Badge>,
    },
    {
      key: "description",
      header: "Descrição",
      cell: (r) => <p className="max-w-[420px] truncate text-[11px]">{r.description ?? "—"}</p>,
      hiddenOnMobile: true,
    },
    {
      key: "entity",
      header: "Entidade",
      hiddenOnMobile: true,
      cell: (r) => (
        <span className="text-[10px] text-[var(--text-muted)]">
          {r.entity}
          {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
        </span>
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      cell: (r) => (
        <Button variant="ghost" size="icon-sm" title="Ver detalhes" onClick={() => setDetail(r)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Auditoria</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {num(data.total)} registro(s) · {num(data.totals.today)} hoje · {num(data.totals.users)} usuário(s) no
            filtro
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Download className="h-3.5 w-3.5" />}
          onClick={() =>
            void downloadFile("/api/reports/audit/export", {
              format: "csv",
              from: filters.from,
              to: filters.to,
              action: filters.action,
            }).catch((e) => toast.error(errorMessage(e)))
          }
        >
          Exportar
        </Button>
      </div>

      <Alert tone="info" title="Trilha imutável">
        Toda operação sensível (vendas, cancelamentos, estoque, financeiro, permissões e configurações) gera um
        registro com usuário, data/hora, IP e valores antes/depois. Registros de auditoria não podem ser editados nem
        excluídos pela aplicação.
      </Alert>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Buscar" className="min-w-[200px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Descrição, usuário ou ação..." />
          </Field>
          <Field label="Usuário" className="w-48">
            <Select value={filters.userId} onChange={(e) => navigate({ userId: e.target.value, page: undefined })}>
              <option value="">Todos</option>
              {facets.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ação" className="w-48">
            <Select value={filters.action} onChange={(e) => navigate({ action: e.target.value, page: undefined })}>
              <option value="ALL">Todas</option>
              {facets.actions.map((a) => (
                <option key={a.value} value={a.value}>{a.value} ({a.total})</option>
              ))}
            </Select>
          </Field>
          <Field label="Entidade" className="w-40">
            <Select value={filters.entity} onChange={(e) => navigate({ entity: e.target.value, page: undefined })}>
              <option value="ALL">Todas</option>
              {facets.entities.map((e) => (
                <option key={e.value} value={e.value}>{e.value} ({e.total})</option>
              ))}
            </Select>
          </Field>
          <Field label="De" className="w-36">
            <Input type="date" value={filters.from} onChange={(e) => navigate({ from: e.target.value, page: undefined })} />
          </Field>
          <Field label="Até" className="w-36">
            <Input type="date" value={filters.to} onChange={(e) => navigate({ to: e.target.value, page: undefined })} />
          </Field>
        </div>
      </Card>

      <DataTable
        data={data.items}
        columns={columns}
        keyExtractor={(r) => r.id}
        pagination={{
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onPageChange: (page) => navigate({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<ScrollText className="h-6 w-6" />}
            title="Nenhum registro de auditoria"
            description="As ações realizadas no sistema aparecem aqui automaticamente."
          />
        }
      />

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.action}
        description={detail ? `${dateTimeBR(detail.createdAt)} · ${detail.userName ?? "sistema"}` : undefined}
        size="lg"
        footer={<Button variant="outline" size="sm" onClick={() => setDetail(null)}>Fechar</Button>}
      >
        {detail && (
          <div className="space-y-3 text-[12px]">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Entidade</p>
                <p className="font-mono text-[11px]">{detail.entity}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Identificador</p>
                <p className="truncate font-mono text-[11px]">{detail.entityId ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">IP de origem</p>
                <p className="font-mono text-[11px]">{detail.ip ?? "não registrado"}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Registrado em</p>
                <p className="flex items-center gap-1 text-[11px]"><Clock className="h-3 w-3" /> {dateTimeBR(detail.createdAt)}</p>
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold">
                <ShieldAlert className="h-3.5 w-3.5" /> Descrição
              </p>
              <p className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-[12px]">{detail.description ?? "—"}</p>
            </div>
            {Boolean(detail.before || detail.after) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.before ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold">Antes</p>
                    <pre className="max-h-52 overflow-auto rounded-lg bg-[var(--bg-muted)] p-2.5 font-mono text-[10px]">
                      {JSON.stringify(detail.before, null, 2) as string}
                    </pre>
                  </div>
                ) : null}
                {detail.after ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold">Depois</p>
                    <pre className="max-h-52 overflow-auto rounded-lg bg-[var(--bg-muted)] p-2.5 font-mono text-[10px]">
                      {JSON.stringify(detail.after, null, 2) as string}
                    </pre>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
