"use client";

/**
 * Detalhe da venda — aberto pelo botão "Ver detalhes" da lista de vendas.
 * Antes esta rota não existia e o botão levava a 404.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Receipt, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, dateTimeBR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, LoadingBlock } from "@/components/ui/primitives";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  COMPLETED: { label: "Concluída", tone: "success" },
  OPEN: { label: "Em aberto", tone: "warning" },
  CANCELED: { label: "Cancelada", tone: "danger" },
  PENDING: { label: "Pendente", tone: "warning" },
  RETURNED: { label: "Devolvida", tone: "neutral" },
};

const PAGAMENTO: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  STORE_CREDIT: "Crediário",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

type Detalhe = {
  sale: {
    id: string;
    number: number;
    status: string;
    total: string;
    subtotal: string;
    discountAmount: string;
    surchargeAmount: string;
    paidAmount: string;
    changeAmount: string;
    itemCount: number;
    createdAt: string;
    cancelReason: string | null;
    notes: string | null;
  };
  customerName: string | null;
  customerDocument: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  items: Array<{
    id: string;
    description: string;
    colorName: string | null;
    sizeName: string | null;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
  }>;
  payments: Array<{ id: string; method: string; amount: string; installments: number }>;
  receivables: Array<{ id: string; amount: string; dueDate: string; status: string }>;
};

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--border-default)] py-1.5 last:border-0">
      <span className="text-[var(--text-muted)]">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  );
}

export function SaleDetailView({ id, podeCancelar }: { id: string; podeCancelar: boolean }) {
  const [dados, setDados] = React.useState<Detalhe | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [cancelando, setCancelando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const res = await api.get<Detalhe>(`/api/sales/${id}`);
      setDados(res);
      setErro(null);
    } catch (err) {
      setErro(errorMessage(err));
    }
  }, [id]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  async function cancelar() {
    const motivo = window.prompt("Motivo do cancelamento da venda:");
    if (!motivo || motivo.trim().length < 3) {
      if (motivo !== null) toast.error("Informe o motivo do cancelamento.");
      return;
    }
    setCancelando(true);
    try {
      await api.post(`/api/sales/${id}/cancel`, { reason: motivo.trim() });
      toast.success("Venda cancelada e estoque devolvido.");
      await carregar();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCancelando(false);
    }
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-10 text-center">
        <p className="text-sm font-medium text-[var(--danger)]">{erro}</p>
        <Link href="/vendas">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Voltar para vendas
          </Button>
        </Link>
      </div>
    );
  }
  if (!dados) return <LoadingBlock label="Carregando venda..." />;

  const { sale } = dados;
  const status = STATUS[sale.status] ?? { label: sale.status, tone: "neutral" as const };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/vendas"
            className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-3 w-3" /> Vendas
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Receipt className="h-4 w-4 text-[var(--accent)]" /> Venda #{sale.number}
            <Badge tone={status.tone}>{status.label}</Badge>
          </h1>
          <p className="text-xs text-[var(--text-muted)]">{dateTimeBR(sale.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/sales/${sale.id}/receipt`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />}>
              Comprovante
            </Button>
          </a>
          {podeCancelar && sale.status === "COMPLETED" && (
            <Button
              variant="ghost"
              size="sm"
              loading={cancelando}
              onClick={() => void cancelar()}
              leftIcon={<XCircle className="h-3.5 w-3.5" />}
            >
              Cancelar venda
            </Button>
          )}
        </div>
      </div>

      {sale.cancelReason && (
        <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
          Cancelada: {sale.cancelReason}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {dados.items.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-3 py-1.5 text-xs">
              <div>
                <p className="font-medium">{i.description}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {[i.colorName, i.sizeName].filter(Boolean).join(" · ") || "—"} · {Number(i.quantity)} ×{" "}
                  {brl(i.unitPrice)}
                  {Number(i.discountAmount) > 0 && ` · desc. ${brl(i.discountAmount)}`}
                </p>
              </div>
              <span className="whitespace-nowrap font-semibold">
                {brl(Number(i.quantity) * Number(i.unitPrice) - Number(i.discountAmount))}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 text-xs">
            {dados.payments.length === 0 && (
              <p className="text-[var(--text-muted)]">Nenhum pagamento registrado.</p>
            )}
            {dados.payments.map((p) => (
              <Linha
                key={p.id}
                rotulo={`${PAGAMENTO[p.method] ?? p.method}${p.installments > 1 ? ` ${p.installments}x` : ""}`}
                valor={brl(p.amount)}
              />
            ))}
            <Linha rotulo="Subtotal" valor={brl(sale.subtotal)} />
            {Number(sale.discountAmount) > 0 && (
              <Linha rotulo="Desconto" valor={`- ${brl(sale.discountAmount)}`} />
            )}
            {Number(sale.surchargeAmount) > 0 && (
              <Linha rotulo="Acréscimo" valor={brl(sale.surchargeAmount)} />
            )}
            <Linha rotulo="Total" valor={<strong>{brl(sale.total)}</strong>} />
            {Number(sale.changeAmount) > 0 && <Linha rotulo="Troco" valor={brl(sale.changeAmount)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-[var(--accent)]" /> Cliente e vendedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 text-xs">
            <Linha rotulo="Cliente" valor={dados.customerName ?? "Consumidor"} />
            {dados.customerDocument && <Linha rotulo="CPF/CNPJ" valor={dados.customerDocument} />}
            {dados.customerPhone && <Linha rotulo="Telefone" valor={dados.customerPhone} />}
            <Linha rotulo="Vendedor" valor={dados.sellerName ?? "—"} />
            <Linha rotulo="Itens" valor={String(sale.itemCount)} />
          </CardContent>
        </Card>
      </div>

      {dados.receivables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Parcelas do crediário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 text-xs">
            {dados.receivables.map((r) => (
              <Linha
                key={r.id}
                rotulo={`Vence ${r.dueDate.split("-").reverse().join("/")}`}
                valor={
                  <span className="flex items-center gap-2">
                    {brl(r.amount)}
                    <Badge tone={r.status === "PAID" ? "success" : r.status === "OVERDUE" ? "danger" : "warning"}>
                      {r.status === "PAID" ? "Paga" : r.status === "OVERDUE" ? "Vencida" : "Em aberto"}
                    </Badge>
                  </span>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      {sale.notes && (
        <p className="rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <strong>Observações:</strong> {sale.notes}
        </p>
      )}
    </div>
  );
}
