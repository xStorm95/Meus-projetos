"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Printer,
  FileCheck2, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Clock, Ban, Search, Settings2,
  FileText, Info,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert, Tabs } from "@/components/ui/primitives";
import { Field, Input, Select, SearchInput } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";

type Doc = {
  id: string;
  saleId: string | null;
  model: string;
  series: number;
  number: number;
  environment: string;
  status: string;
  accessKey: string | null;
  protocol: string | null;
  rejectionCode: string | null;
  rejectionMessage: string | null;
  total: string;
  provider: string | null;
  issuedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  saleNumber: number | null;
  customerName: string | null;
  userName: string | null;
};

type Readiness = {
  ready: boolean;
  provider: string | null;
  environment: "HOMOLOGATION" | "PRODUCTION";
  checks: Array<{ key: string; label: string; ok: boolean; hint: string }>;
};

type PendingSale = {
  id: string;
  number: number;
  total: string;
  completedAt: string | null;
  customerName: string | null;
  customerDocument: string | null;
  documents: number;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Preparado (não transmitido)", tone: "warning" },
  AUTHORIZED: { label: "Autorizado pela SEFAZ", tone: "success" },
  REJECTED: { label: "Rejeitado", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
  SIMULATED: { label: "Simulado", tone: "info" },
};

export function FiscalView({
  documents,
  readiness,
  stats,
  pendingSales,
  filters,
  permissions,
}: {
  documents: { items: Doc[]; total: number; totals: { pending: number; authorized: number; rejected: number; value: string }; page: number; pageSize: number };
  readiness: Readiness;
  stats: { total: number; pending: number; authorized: number; rejected: number; canceled: number; authorizedValue: string };
  pendingSales: PendingSale[];
  filters: { status: string; model: string; from: string; to: string };
  permissions: { canEmit: boolean; canCancel: boolean; canConfigure: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"DOCS" | "READY" | "PENDING">("READY");
  const [search, setSearch] = React.useState("");
  const [prepare, setPrepare] = React.useState<PendingSale | null>(null);
  const [model, setModel] = React.useState<"65" | "55">("65");
  const [cancelTarget, setCancelTarget] = React.useState<Doc | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "ALL") continue;
      next.set(k, String(v));
    }
    router.push(`/fiscal?${next.toString()}`);
  }

  const visibleDocs = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents.items;
    return documents.items.filter(
      (d) =>
        String(d.number).includes(term) ||
        (d.customerName ?? "").toLowerCase().includes(term) ||
        String(d.saleNumber ?? "").includes(term),
    );
  }, [documents.items, search]);

  async function prepareDocument(force = false) {
    if (!prepare) return;
    setSaving(true);
    try {
      const result = await api.post<{ document: Doc }>("/api/fiscal/documents", {
        saleId: prepare.id,
        model,
        force,
      });
      toast.success(
        `Documento modelo ${result.document.model} nº ${result.document.number} registrado como PENDING. ` +
          "A transmissão ocorrerá quando o provedor estiver integrado.",
      );
      setPrepare(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function cancelDocument() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) return toast.error("Informe o motivo do cancelamento.");
    setSaving(true);
    try {
      await api.post(`/api/fiscal/documents/${cancelTarget.id}/cancel`, { reason: cancelReason });
      toast.success("Documento cancelado no ERP. Cancele também no portal da SEFAZ/Provedor.");
      setCancelTarget(null);
      setCancelReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Doc>[] = [
    {
      key: "doc",
      header: "Documento",
      sortable: true,
      sortValue: (d) => d.number,
      cell: (d) => (
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">
            {d.model === "65" ? "NFC-e" : "NF-e"} {d.series}/{d.number}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {d.saleNumber ? `Venda #${d.saleNumber}` : "sem venda"} · {dateTimeBR(d.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      hiddenOnMobile: true,
      cell: (d) => <span className="text-[11px]">{d.customerName ?? "Consumidor final"}</span>,
    },
    {
      key: "total",
      header: "Valor",
      align: "right",
      sortable: true,
      sortValue: (d) => Number(d.total),
      cell: (d) => <span className="text-[12px] font-semibold tabular-nums">{brl(d.total)}</span>,
    },
    {
      key: "env",
      header: "Ambiente",
      hiddenOnMobile: true,
      cell: (d) => (
        <Badge tone={d.environment === "PRODUCTION" ? "danger" : "info"}>
          {d.environment === "PRODUCTION" ? "Produção" : "Homologação"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (d) => (
        <Badge tone={STATUS[d.status]?.tone ?? "neutral"}>{STATUS[d.status]?.label ?? d.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <a
            href={`/api/fiscal/documents/${d.id}/danfe`}
            target="_blank"
            rel="noreferrer"
            title="Imprimir cupom (DANFE simplificada)"
          >
            <Button variant="ghost" size="icon-sm" title="Imprimir cupom">
              <Printer className="h-3.5 w-3.5" />
            </Button>
          </a>
          {permissions.canCancel && d.status !== "CANCELED" && (
            <Button variant="ghost" size="icon-sm" title="Cancelar documento" onClick={() => setCancelTarget(d)}>
              <Ban className="h-3.5 w-3.5 text-[var(--danger)]" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const readyCount = readiness.checks.filter((c) => c.ok).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Fiscal</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Arquitetura de integração NFC-e/NF-e · {num(stats.total)} documento(s) registrado(s)
          </p>
        </div>
        {permissions.canConfigure && (
          <Link href="/configuracoes">
            <Button variant="outline" size="sm" leftIcon={<Settings2 className="h-3.5 w-3.5" />}>
              Configurar integração
            </Button>
          </Link>
        )}
      </div>

      <Alert tone="warning" title="Nenhuma emissão fiscal simulada">
        O ORION <strong>não transmite documentos à SEFAZ</strong> por conta própria. Esta tela registra a
        intenção de emissão, valida os requisitos e mantém a fila para um provedor externo homologado. Um documento só
        muda para <em>Autorizado</em> quando o provedor retorna autorização real — jamais por simulação.
      </Alert>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Preparados (fila)", value: num(stats.pending), icon: Clock, tone: "text-[var(--warning)]" },
          { label: "Autorizados", value: num(stats.authorized), icon: CheckCircle2, tone: "text-[var(--success)]" },
          { label: "Rejeitados", value: num(stats.rejected), icon: XCircle, tone: "text-[var(--danger)]" },
          { label: "Valor autorizado", value: brl(stats.authorizedValue), icon: FileCheck2, tone: "text-[var(--accent-strong)]" },
        ].map((card) => (
          <Card key={card.label} className="flex items-center gap-3 p-3">
            <div className={cn("rounded-lg bg-[var(--bg-muted)] p-2", card.tone)}>
              <card.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{card.label}</p>
              <p className="text-lg font-bold tabular-nums">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "READY", label: `Prontidão (${readyCount}/${readiness.checks.length})` },
          { value: "PENDING", label: "Vendas sem documento", count: pendingSales.length },
          { value: "DOCS", label: "Documentos registrados", count: documents.total },
        ]}
      />

      {tab === "READY" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-[var(--accent-strong)]" /> Checklist de integração
            </h2>
            <Badge tone={readiness.ready ? "success" : "warning"}>
              {readiness.ready ? "Ambiente pronto" : `${readyCount}/${readiness.checks.length} requisitos`}
            </Badge>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {readiness.checks.map((check) => (
              <div key={check.key} className="flex items-start gap-3 py-2.5">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium">{check.label}</p>
                  {!check.ok && <p className="text-[11px] text-[var(--text-muted)]">{check.hint}</p>}
                </div>
                <Badge tone={check.ok ? "success" : "neutral"}>{check.ok ? "OK" : "Pendente"}</Badge>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
              <Info className="h-3.5 w-3.5" /> Como habilitar a emissão real
            </p>
            <ol className="list-inside list-decimal space-y-0.5">
              <li>Contrate um provedor de emissão (Focus NFe, eNotas, PlugNotas, Tecnospeed…).</li>
              <li>Informe em Configurações → Fiscal o provedor, CSC/token e dados do certificado A1.</li>
              <li>Cadastre NCM/CSOSN/origem nos produtos (obrigatório por item).</li>
              <li>Implemente o adaptador do provedor em <code>src/server/services/fiscal-provider.ts</code> (ponto de extensão preparado).</li>
              <li>Só então os documentos da fila passam a ser transmitidos e atualizados automaticamente.</li>
            </ol>
          </div>
          <div className="rounded-xl border border-[var(--border-default)] p-3 text-[11px] text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">Modelo de dados já preparado</p>
            <p className="mt-1">
              A tabela <code>fiscal_documents</code> guarda modelo, série, número, ambiente, chave de acesso, protocolo,
              XML, código/mensagem de rejeição, payload de requisição e resposta, valores e datas. A numeração é
              controlada em Configurações → Fiscal para evitar duplicidade.
            </p>
          </div>
        </Card>
      )}

      {tab === "PENDING" && (
        <Card className="overflow-hidden">
          {pendingSales.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="Todas as vendas têm documento registrado"
              description="Vendas concluídas nos últimos 90 dias já possuem documento fiscal preparado."
            />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {pendingSales.map((sale) => (
                <div key={sale.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <FileText className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold">Venda #{sale.number}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {sale.completedAt ? dateTimeBR(sale.completedAt) : "—"} · {sale.customerName ?? "Consumidor final"}
                      {sale.customerDocument ? ` · ${sale.customerDocument}` : ""}
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums">{brl(sale.total)}</span>
                  {permissions.canEmit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPrepare(sale);
                        setModel(sale.customerDocument ? "55" : "65");
                      }}
                    >
                      Preparar documento
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "DOCS" && (
        <>
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Buscar" className="min-w-[200px] flex-1">
                <SearchInput value={search} onChange={setSearch} placeholder="Número, cliente ou venda..." />
              </Field>
              <Field label="Situação" className="w-48">
                <Select value={filters.status} onChange={(e) => navigate({ status: e.target.value, page: undefined })}>
                  <option value="ALL">Todas</option>
                  <option value="PENDING">Preparados</option>
                  <option value="AUTHORIZED">Autorizados</option>
                  <option value="REJECTED">Rejeitados</option>
                  <option value="CANCELED">Cancelados</option>
                </Select>
              </Field>
              <Field label="Modelo" className="w-40">
                <Select value={filters.model} onChange={(e) => navigate({ model: e.target.value, page: undefined })}>
                  <option value="ALL">Todos</option>
                  <option value="65">NFC-e (65)</option>
                  <option value="55">NF-e (55)</option>
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
            data={visibleDocs}
            columns={columns}
            keyExtractor={(d) => d.id}
            pagination={{
              page: documents.page,
              pageSize: documents.pageSize,
              total: documents.total,
              onPageChange: (page) => navigate({ page }),
            }}
            emptyState={
              <EmptyState
                icon={<FileCheck2 className="h-6 w-6" />}
                title="Nenhum documento registrado"
                description="Prepare documentos a partir das vendas concluídas. Nada é transmitido sem provedor configurado."
              />
            }
          />
        </>
      )}

      <Modal
        open={Boolean(prepare)}
        onClose={() => setPrepare(null)}
        title="Preparar documento fiscal"
        description={prepare ? `Venda #${prepare.number} · ${brl(prepare.total)}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPrepare(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void prepareDocument(!readiness.ready)}>
              Registrar documento
            </Button>
          </>
        }
      >
        {prepare && (
          <div className="space-y-3">
            <Field label="Modelo">
              <Select value={model} onChange={(e) => setModel(e.target.value as never)}>
                <option value="65">NFC-e — consumidor (modelo 65)</option>
                <option value="55">NF-e — destinatário com CPF/CNPJ (modelo 55)</option>
              </Select>
            </Field>
            {!readiness.ready && (
              <Alert tone="warning" title="Integração incompleta">
                Os requisitos pendentes impedem a transmissão real. O documento será registrado na fila como{" "}
                <strong>PENDING</strong> para que você conclua a configuração depois — nada será enviado à SEFAZ.
              </Alert>
            )}
            {readiness.ready && (
              <Alert tone="info">
                Integração pronta. Mesmo assim, o envio depende do adaptador do provedor estar implementado no servidor.
              </Alert>
            )}
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 text-[11px]">
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Cliente</span><span>{prepare.customerName ?? "Consumidor final"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Documento</span><span>{prepare.customerDocument ?? "não informado"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Ambiente</span><span>{readiness.environment === "PRODUCTION" ? "Produção" : "Homologação"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Provedor</span><span>{readiness.provider ?? "não configurado"}</span></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancelar documento no ERP"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button variant="danger" size="sm" loading={saving} onClick={() => void cancelDocument()}>Cancelar documento</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning">
            Este cancelamento é apenas no ERP. Se o documento já foi autorizado, o cancelamento também precisa ser
            solicitado no portal da SEFAZ/provedor dentro do prazo legal.
          </Alert>
          <Field label="Motivo" required>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
