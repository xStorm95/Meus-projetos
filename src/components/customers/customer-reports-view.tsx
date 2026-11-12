"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Crown, UserMinus, Users, Download, MessageCircle, Phone, ArrowLeft, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, downloadFile } from "@/lib/api-client";
import { brl, cn, dateBR, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Tabs, Badge } from "@/components/ui/primitives";
import { Field, Select } from "@/components/ui/form";

type ReportType = "INATIVOS30" | "INATIVOS60" | "INATIVOS90" | "TOP" | "ANIVERSARIANTES";

type InactiveRow = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  accepts_whatsapp: boolean;
  ultima_compra: string | null;
  compras: number;
  total_gasto: string;
  dias_sem_comprar: number;
};

type TopRow = {
  id: string;
  name: string;
  phone: string | null;
  compras: number;
  total: string;
  ticket_medio: string;
  ultima_compra: string | null;
};

type BirthdayRow = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  birthDate: string;
  acceptsWhatsapp: boolean;
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function CustomerReportsView({
  data,
  type,
  month,
  summary,
}: {
  data: {
    inactive30: InactiveRow[];
    inactive60: InactiveRow[];
    inactive90: InactiveRow[];
    top: TopRow[];
    birthdays: BirthdayRow[];
  };
  type: ReportType;
  month: number;
  summary: {
    vip: number;
    inactive90: number;
    overdue: number;
    birthdays: number;
    total: number;
    ticketAverage: string;
  };
}) {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = React.useState(month);

  const tabs: Array<{ value: ReportType; label: string; count: number }> = [
    { value: "INATIVOS30", label: "Inativos 30d", count: data.inactive30.length },
    { value: "INATIVOS60", label: "Inativos 60d", count: data.inactive60.length },
    { value: "INATIVOS90", label: "Inativos 90d", count: data.inactive90.length },
    { value: "TOP", label: "Top clientes", count: data.top.length },
    { value: "ANIVERSARIANTES", label: "Aniversariantes", count: data.birthdays.length },
  ];

  function navigate(nextType: ReportType, nextMonth = selectedMonth) {
    const qs = new URLSearchParams({ type: nextType });
    if (nextType === "ANIVERSARIANTES") qs.set("month", String(nextMonth));
    router.push(`/clientes/relatorios?${qs.toString()}`);
  }

  async function exportCsv() {
    try {
      const kind =
        type === "TOP"
          ? "top-customers"
          : type === "ANIVERSARIANTES"
            ? "birthdays"
            : `inactive-${type.replace("INATIVOS", "")}`;
      await downloadFile("/api/reports/customers/export", {
        kind,
        format: "csv",
        month: type === "ANIVERSARIANTES" ? selectedMonth : undefined,
      });
      toast.success("Relatório gerado.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const inactiveRows =
    type === "INATIVOS30" ? data.inactive30 : type === "INATIVOS60" ? data.inactive60 : data.inactive90;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/clientes" className="mb-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-3 w-3" /> Clientes
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Relatórios de clientes
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Base de {num(summary.total)} clientes · ticket médio {brl(summary.ticketAverage)}
          </p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => void exportCsv()}>
          Exportar CSV
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Clientes VIP", value: num(summary.vip), icon: Crown, tone: "text-[var(--accent-strong)]" },
          { label: "Inativos +90 dias", value: num(summary.inactive90), icon: UserMinus, tone: "text-[var(--warning)]" },
          { label: "Com dívida vencida", value: num(summary.overdue), icon: TrendingUp, tone: "text-[var(--danger)]" },
          { label: "Aniversariantes do mês", value: num(summary.birthdays), icon: Calendar, tone: "text-[var(--info)]" },
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

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={type} onChange={(v) => navigate(v)} tabs={tabs} />
        {type === "ANIVERSARIANTES" && (
          <Field label="" className="w-40">
            <Select
              value={selectedMonth}
              onChange={(e) => {
                const m = Number(e.target.value);
                setSelectedMonth(m);
                navigate("ANIVERSARIANTES", m);
              }}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <Card className="overflow-hidden">
        {type === "TOP" ? (
          data.top.length === 0 ? (
            <EmptyState icon={<Crown className="h-6 w-6" />} title="Sem compras registradas" description="Os clientes aparecem aqui após a primeira compra concluída." />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Cliente</th>
                  <th className="px-2 py-2 text-right">Compras</th>
                  <th className="px-2 py-2 text-right">Total gasto</th>
                  <th className="px-2 py-2 text-right">Ticket médio</th>
                  <th className="px-4 py-2 text-right">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {data.top.map((row, index) => (
                  <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                    <td className="px-4 py-2 text-[var(--text-muted)]">{index + 1}</td>
                    <td className="px-2 py-2">
                      <Link href={`/clientes/${row.id}`} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                      {row.phone && <p className="text-[10px] text-[var(--text-muted)]">{row.phone}</p>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.compras}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{brl(row.total)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{brl(row.ticket_medio)}</td>
                    <td className="px-4 py-2 text-right text-[11px] text-[var(--text-muted)]">
                      {row.ultima_compra ? dateBR(row.ultima_compra.slice(0, 10)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : type === "ANIVERSARIANTES" ? (
          data.birthdays.length === 0 ? (
            <EmptyState icon={<Calendar className="h-6 w-6" />} title="Nenhum aniversariante" description={`Nenhum cliente cadastrado com aniversário em ${MONTHS[selectedMonth - 1]}.`} />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left">Dia</th>
                  <th className="px-2 py-2 text-left">Cliente</th>
                  <th className="px-2 py-2 text-left">Contato</th>
                  <th className="px-4 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.birthdays.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                    <td className="px-4 py-2 font-semibold tabular-nums">{dateBR(row.birthDate).slice(0, 5)}</td>
                    <td className="px-2 py-2">
                      <Link href={`/clientes/${row.id}`} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-[11px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {row.phone ?? row.whatsapp ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {(row.whatsapp || row.phone) && row.acceptsWhatsapp && (
                        <a
                          href={`https://wa.me/55${(row.whatsapp ?? row.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(
                            `Olá ${row.name.split(" ")[0]}! A loja deseja um feliz aniversário 🎉 Venha nos visitar, preparamos uma surpresa para você.`,
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="ghost" size="icon-sm" title="Enviar parabéns pelo WhatsApp">
                            <MessageCircle className="h-3.5 w-3.5 text-[var(--success)]" />
                          </Button>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : inactiveRows.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Nenhum cliente inativo" description="Boa notícia: todos os clientes compraram dentro do período analisado." />
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-2 py-2 text-right">Dias sem comprar</th>
                <th className="px-2 py-2 text-right">Compras</th>
                <th className="px-2 py-2 text-right">Total gasto</th>
                <th className="px-4 py-2 text-right">Contato</th>
              </tr>
            </thead>
            <tbody>
              {inactiveRows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-2">
                    <Link href={`/clientes/${row.id}`} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                    {row.ultima_compra && (
                      <p className="text-[10px] text-[var(--text-muted)]">última {dateBR(row.ultima_compra.slice(0, 10))}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Badge tone={row.dias_sem_comprar > 180 ? "danger" : "warning"}>{row.dias_sem_comprar}d</Badge>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.compras}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{brl(row.total_gasto)}</td>
                  <td className="px-4 py-2 text-right">
                    {(row.whatsapp || row.phone) && row.accepts_whatsapp ? (
                      <a
                        href={`https://wa.me/55${(row.whatsapp ?? row.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(
                          `Olá ${row.name.split(" ")[0]}! Sentimos sua falta 💛 Temos novidades que combinam com você.`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="ghost" size="icon-sm" title="Enviar mensagem no WhatsApp">
                          <MessageCircle className="h-3.5 w-3.5 text-[var(--success)]" />
                        </Button>
                      </a>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">sem opt-in</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-[10px] text-[var(--text-muted)]">
        Os contatos exibidos respeitam o consentimento LGPD registrado no cadastro de cada cliente (aceite de
        WhatsApp/e-mail). Mensagens são abertas em seu aplicativo — nenhum envio automático é simulado sem integração
        configurada.
      </p>
    </div>
  );
}
