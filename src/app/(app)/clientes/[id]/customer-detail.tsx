"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Phone, Mail, MapPin, Cake, Crown, AlertTriangle, ShoppingBag,
  Wallet, Trash2, Receipt, TrendingUp, CreditCard, MessageCircle, ShieldX, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateBR, dateTimeBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Modal, EmptyState, ConfirmDialog, Tabs } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { SALE_STATUS, RECEIVABLE_STATUS } from "@/lib/constants";

type Data = {
  customer: {
    id: string;
    name: string;
    document: string | null;
    birthDate: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    addressNumber: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    notes: string | null;
    sizePreference: string | null;
    creditLimit: string;
    isActive: boolean;
    acceptsWhatsapp: boolean;
    lgpdConsentAt: string | null;
    createdAt: string;
  };
  summary: {
    purchaseCount: number;
    totalSpent: string;
    ticketAverage: string;
    lastPurchase: string | null;
    debtTotal: string;
    debtOverdue: string;
    debtOpen: string;
    creditAvailable: string;
    classifications: string[];
  };
  purchases: Array<{
    id: string;
    number: number;
    total: string;
    itemCount: number;
    status: string;
    createdAt: string;
  }>;
  openInstallments: Array<{
    id: string;
    amount: string;
    paidAmount: string;
    dueDate: string;
    status: string;
    installmentNumber: number;
    installmentTotal: number;
    description: string | null;
  }>;
  credits: Array<{ id: string; amount: string; available: string; origin: string; createdAt: string }>;
  returns: Array<{ id: string; code: string; type: string; reason: string; returnedTotal: string; saleNumber: number | null; createdAt: string }>;
  favoriteProducts: Array<{ name: string; reference: string; quantity: number; purchases: number }>;
};

const CLASS_CONFIG: Record<string, { label: string; tone: "gold" | "success" | "warning" | "danger" | "info" | "neutral" | "rose" }> = {
  NOVO: { label: "Cliente novo", tone: "info" },
  RECORRENTE: { label: "Recorrente", tone: "success" },
  VIP: { label: "VIP", tone: "gold" },
  INATIVO: { label: "Inativo", tone: "neutral" },
  INADIMPLENTE: { label: "Crediário em aberto", tone: "danger" },
  ANIVERSARIANTE: { label: "Aniversariante do mês", tone: "rose" },
};

export function CustomerDetail({
  data,
  permissions,
}: {
  data: Data;
  permissions: { canEdit: boolean; canDelete: boolean; canReceive: boolean; canCreditLimit: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"visao" | "compras" | "crediario" | "trocas">("visao");
  const [receiveItem, setReceiveItem] = React.useState<Data["openInstallments"][number] | null>(null);
  const [receiveAmount, setReceiveAmount] = React.useState(0);
  const [receiveMethod, setReceiveMethod] = React.useState("CASH");
  const [applyCharges, setApplyCharges] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [whatsOpen, setWhatsOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const c = data.customer;

  async function handleReceive() {
    if (!receiveItem) return;
    setSaving(true);
    try {
      await api.post("/api/finance/receivables/receive", {
        receivableId: receiveItem.id,
        amount: receiveAmount,
        method: receiveMethod,
        applyCharges,
      });
      toast.success("Recebimento registrado.");
      setReceiveItem(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await api.delete<{ message: string }>(`/api/customers/${c.id}`);
      toast.success(res.message);
      router.push("/clientes");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendWhatsApp() {
    if (!message.trim()) {
      toast.error("Escreva a mensagem.");
      return;
    }
    try {
      const res = await api.post<{ sent: boolean; message: string; link?: string }>("/api/integrations/whatsapp/send", {
        customerId: c.id,
        message,
      });
      if (res.sent) {
        toast.success("Mensagem enviada pelo WhatsApp Business API.");
      } else {
        toast.info(res.message);
        if (res.link) window.open(res.link, "_blank");
      }
      setWhatsOpen(false);
      setMessage("");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/clientes">
            <Button variant="ghost" size="icon-sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
                {c.name}
              </h1>
              {!c.isActive && <Badge tone="neutral">Inativo</Badge>}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Cliente desde {dateBR(c.createdAt)}
              {c.document && ` · ${formatDoc(c.document)}`}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {data.summary.classifications.map((tag) => {
                const cfg = CLASS_CONFIG[tag];
                if (!cfg) return null;
                return <Badge key={tag} tone={cfg.tone}>{cfg.label}</Badge>;
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.whatsapp && c.acceptsWhatsapp && (
            <Button variant="outline" size="sm" onClick={() => setWhatsOpen(true)} leftIcon={<MessageCircle className="h-3.5 w-3.5" />}>
              WhatsApp
            </Button>
          )}
          {permissions.canEdit && (
            <Link href={`/clientes/${c.id}/editar`}>
              <Button variant="outline" size="sm" leftIcon={<Pencil className="h-3.5 w-3.5" />}>Editar</Button>
            </Link>
          )}
          {permissions.canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-[var(--danger)]"
              onClick={() => setDeleteOpen(true)}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Excluir dados
            </Button>
          )}
          <Link href={`/pdv`}>
            <Button size="sm" leftIcon={<ShoppingBag className="h-3.5 w-3.5" />}>Nova venda</Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MiniCard label="Total gasto" value={brl(data.summary.totalSpent)} hint={`${num(data.summary.purchaseCount)} compras`} icon={<TrendingUp className="h-3.5 w-3.5" />} tone="gold" />
        <MiniCard label="Ticket médio" value={brl(data.summary.ticketAverage)} hint={data.summary.lastPurchase ? `Última: ${dateBR(data.summary.lastPurchase)}` : "Sem compras"} icon={<Receipt className="h-3.5 w-3.5" />} />
        <MiniCard
          label="Crediário aberto"
          value={brl(data.summary.debtTotal)}
          hint={Number(data.summary.debtOverdue) > 0 ? `${brl(data.summary.debtOverdue)} vencido` : "Em dia"}
          icon={<CreditCard className="h-3.5 w-3.5" />}
          tone={Number(data.summary.debtOverdue) > 0 ? "danger" : undefined}
        />
        <MiniCard label="Crédito disponível" value={brl(data.summary.creditAvailable)} hint={`Limite ${brl(c.creditLimit)}`} icon={<Wallet className="h-3.5 w-3.5" />} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contato */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Contato e endereço</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <InfoRow icon={<Phone className="h-3 w-3" />} label="Telefone" value={c.phone ? formatDoc(c.phone) : "—"} />
            <InfoRow icon={<MessageCircle className="h-3 w-3" />} label="WhatsApp" value={c.whatsapp ? formatDoc(c.whatsapp) : "—"} badge={c.acceptsWhatsapp ? "Autorizado" : undefined} />
            <InfoRow icon={<Mail className="h-3 w-3" />} label="E-mail" value={c.email ?? "—"} />
            <InfoRow icon={<Cake className="h-3 w-3" />} label="Nascimento" value={c.birthDate ? dateBR(c.birthDate) : "—"} />
            <InfoRow
              icon={<MapPin className="h-3 w-3" />}
              label="Endereço"
              value={[c.address, c.addressNumber, c.district, c.city && `${c.city}${c.state ? `/${c.state}` : ""}`, c.zip].filter(Boolean).join(", ") || "—"}
            />
            {c.sizePreference && <InfoRow icon={<Crown className="h-3 w-3" />} label="Tamanho" value={c.sizePreference} />}
            <InfoRow icon={<Calendar className="h-3 w-3" />} label="Consentimento LGPD" value={c.lgpdConsentAt ? dateTimeBR(c.lgpdConsentAt) : "Não registrado"} />
            {c.notes && (
              <div className="mt-2 rounded-lg bg-[var(--bg-muted)] p-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {c.notes}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conteúdo em abas */}
        <div className="space-y-3 lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "visao", label: "Visão geral" },
              { value: "compras", label: "Compras", count: data.purchases.length },
              { value: "crediario", label: "Crediário", count: data.openInstallments.length },
              { value: "trocas", label: "Trocas", count: data.returns.length },
            ]}
          />

          {tab === "visao" && (
            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Produtos preferidos</CardTitle>
                    <CardDescription>Itens mais comprados por este cliente</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {data.favoriteProducts.length === 0 ? (
                    <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="Sem histórico de compras" description="Assim que o cliente comprar, os produtos preferidos aparecerão aqui." />
                  ) : (
                    <ul className="divide-y divide-[var(--border-default)]">
                      {data.favoriteProducts.map((p) => (
                        <li key={p.reference} className="flex items-center justify-between gap-2 px-5 py-2 text-xs">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.name}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">Ref. {p.reference}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-bold tabular-nums">{num(p.quantity)} un.</span>
                            <span className="text-[10px] text-[var(--text-muted)]">{num(p.purchases)} compra(s)</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {data.credits.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Créditos disponíveis</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {data.credits.map((cr) => (
                      <div key={cr.id} className="flex items-center justify-between rounded-lg bg-[var(--success-soft)] px-3 py-2 text-xs">
                        <span className="text-[var(--text-secondary)]">
                          Crédito de {cr.origin === "RETURN" ? "troca/devolução" : cr.origin} · {dateBR(cr.createdAt)}
                        </span>
                        <strong className="text-[var(--success)]">{brl(cr.available)}</strong>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {tab === "compras" && (
            <Card className="overflow-hidden">
              {data.purchases.length === 0 ? (
                <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="Nenhuma compra registrada" description="As compras aparecem aqui automaticamente." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-pro">
                    <thead>
                      <tr>
                        <th>Venda</th>
                        <th>Data</th>
                        <th className="text-center">Itens</th>
                        <th className="text-right">Total</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchases.map((s) => (
                        <tr key={s.id} className="cursor-pointer" onClick={() => router.push(`/vendas/${s.id}`)}>
                          <td className="text-xs font-semibold">#{s.number}</td>
                          <td className="whitespace-nowrap text-[11px]">{dateTimeBR(s.createdAt)}</td>
                          <td className="text-center text-[11px] tabular-nums">{s.itemCount}</td>
                          <td className="text-right text-xs font-semibold tabular-nums">{brl(s.total)}</td>
                          <td>
                            <Badge tone={(SALE_STATUS[s.status]?.tone as "success" | "warning" | "danger") ?? "neutral"}>
                              {SALE_STATUS[s.status]?.label ?? s.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === "crediario" && (
            <Card className="overflow-hidden">
              {data.openInstallments.length === 0 ? (
                <EmptyState icon={<CreditCard className="h-6 w-6" />} title="Sem parcelas em aberto" description="O cliente está em dia com o crediário." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-pro">
                    <thead>
                      <tr>
                        <th>Parcela</th>
                        <th>Vencimento</th>
                        <th className="text-right">Valor</th>
                        <th className="text-right">Saldo</th>
                        <th>Situação</th>
                        {permissions.canReceive && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {data.openInstallments.map((r) => {
                        const overdue = new Date(r.dueDate) < new Date(new Date().toISOString().slice(0, 10));
                        return (
                          <tr key={r.id}>
                            <td className="text-[11px]">{r.installmentNumber}/{r.installmentTotal}</td>
                            <td className={cn("whitespace-nowrap text-[11px]", overdue && "font-semibold text-[var(--danger)]")}>
                              {dateBR(r.dueDate)}
                            </td>
                            <td className="text-right text-[11px] tabular-nums">{brl(r.amount)}</td>
                            <td className="text-right text-xs font-semibold tabular-nums">
                              {brl(Number(r.amount) - Number(r.paidAmount))}
                            </td>
                            <td>
                              <Badge tone={(RECEIVABLE_STATUS[r.status]?.tone as "success" | "warning" | "danger" | "info" | "neutral") ?? "neutral"}>
                                {RECEIVABLE_STATUS[r.status]?.label ?? r.status}
                              </Badge>
                            </td>
                            {permissions.canReceive && (
                              <td className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReceiveItem(r);
                                    setReceiveAmount(Number(r.amount) - Number(r.paidAmount));
                                  }}
                                >
                                  Receber
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === "trocas" && (
            <Card className="overflow-hidden">
              {data.returns.length === 0 ? (
                <EmptyState icon={<Receipt className="h-6 w-6" />} title="Sem trocas ou devoluções" description="Operações de troca e devolução aparecerão aqui." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-pro">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Tipo</th>
                        <th>Motivo</th>
                        <th className="text-right">Valor</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.returns.map((r) => (
                        <tr key={r.id}>
                          <td className="text-[11px] font-semibold">{r.code}</td>
                          <td className="text-[11px]">{r.type === "EXCHANGE" ? "Troca" : "Devolução"}</td>
                          <td className="max-w-[240px] truncate text-[11px] text-[var(--text-muted)]">{r.reason}</td>
                          <td className="text-right text-[11px] tabular-nums">{brl(r.returnedTotal)}</td>
                          <td className="whitespace-nowrap text-[11px]">{dateBR(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Receber parcela */}
      <Modal
        open={Boolean(receiveItem)}
        onClose={() => setReceiveItem(null)}
        title="Receber parcela"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReceiveItem(null)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={() => void handleReceive()}>Confirmar recebimento</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Valor recebido" required>
            <MoneyInput value={receiveAmount} onChange={setReceiveAmount} />
          </Field>
          <Field label="Forma de recebimento">
            <Select value={receiveMethod} onChange={(e) => setReceiveMethod(e.target.value)}>
              <option value="CASH">Dinheiro</option>
              <option value="PIX">Pix</option>
              <option value="DEBIT">Cartão de débito</option>
              <option value="CREDIT">Cartão de crédito</option>
              <option value="TRANSFER">Transferência</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={applyCharges} onChange={(e) => setApplyCharges(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Aplicar multa e juros de atraso
          </label>
          <p className="text-[11px] text-[var(--text-muted)]">
            O recebimento é registrado no caixa aberto (quando em dinheiro) e no histórico financeiro.
            Pagamentos parciais são permitidos.
          </p>
        </div>
      </Modal>

      {/* WhatsApp */}
      <Modal
        open={whatsOpen}
        onClose={() => setWhatsOpen(false)}
        title="Enviar mensagem por WhatsApp"
        description={c.acceptsWhatsapp ? "Cliente autorizou contato via WhatsApp" : "Cliente NÃO autorizou contato — confirme antes de enviar"}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setWhatsOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => void sendWhatsApp()}>Enviar</Button>
          </>
        }
      >
        <div className="space-y-2">
          {!c.acceptsWhatsapp && (
            <div className="rounded-lg bg-[var(--warning-soft)] p-2.5 text-[11px] text-[var(--warning)]">
              <AlertTriangle className="mb-1 inline h-3 w-3" /> Sem consentimento registrado (LGPD).
              Solicite autorização antes de enviar comunicações.
            </div>
          )}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="field"
            placeholder={`Olá, ${c.name.split(" ")[0]}! Temos novidades na loja...`}
          />
          <p className="text-[10px] text-[var(--text-muted)]">
            Sem as credenciais do WhatsApp Business API configuradas, o sistema abre o WhatsApp Web
            com a mensagem pronta. A integração oficial é ativada nas Configurações.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={saving}
        title="Excluir dados pessoais (LGPD)"
        message={
          <>
            Os dados pessoais de <strong>{c.name}</strong> serão anonimizados e o cadastro inativado.
            <br />
            <span className="mt-2 block text-xs text-[var(--text-muted)]">
              O histórico de vendas e financeiro é preservado de forma anônima, conforme exigido pela
              legislação fiscal. Esta ação não pode ser desfeita.
            </span>
          </>
        }
        confirmLabel="Anonimizar dados"
      />
    </div>
  );
}

function MiniCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "gold" | "danger" | "success";
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-[var(--text-muted)]",
            tone === "gold" && "text-[var(--accent)]",
            tone === "danger" && "text-[var(--danger)]",
            tone === "success" && "text-[var(--success)]",
          )}
        >
          {icon}
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      </div>
      <p className={cn(
        "mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums",
        tone === "danger" && "text-[var(--danger)]",
        tone === "success" && "text-[var(--success)]",
        tone === "gold" && "text-[var(--accent)]",
      )}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--text-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <p className="break-words text-[11px] text-[var(--text-primary)]">{value}</p>
      </div>
      {badge && <Badge tone="success" className="text-[9px]">{badge}</Badge>}
    </div>
  );
}

function formatDoc(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  return v;
}

void ShieldX;
