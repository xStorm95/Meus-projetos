"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, Alert } from "@/components/ui/primitives";

/** Retoma uma venda em aberto: carrega os dados e reabre o PDV. */
export function PdvResume({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sale, setSale] = React.useState<{
    sale: { id: string; number: number; total: string; status: string; notes: string | null };
    items: Array<{ description: string; quantity: string; unitPrice: string; total: string }>;
  } | null>(null);

  React.useEffect(() => {
    api
      .get<NonNullable<typeof sale>>(`/api/sales/${saleId}`)
      .then((res) => {
        if (res.sale.status !== "OPEN") {
          setError("Esta venda não está mais em aberto.");
        } else {
          setSale(res);
        }
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [saleId]);

  async function finalize() {
    try {
      await api.post("/api/sales/open", {
        saleId,
        payments: [{ method: "CASH", amount: Number(sale!.sale.total) }],
      });
      toast.success(`Venda #${sale!.sale.number} finalizada.`);
      router.push("/pdv");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <Alert tone="danger">{error ?? "Venda não encontrada."}</Alert>
        <Button variant="outline" onClick={() => router.push("/pdv")} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Voltar ao PDV
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/pdv")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Retomando venda #{sale.sale.number}
        </h1>
      </div>
      <Card className="p-4">
        <ul className="divide-y divide-[var(--border-default)] text-xs">
          {sale.items.map((item, i) => (
            <li key={i} className="flex justify-between py-1.5">
              <span>{item.quantity}× {item.description}</span>
              <span className="font-semibold tabular-nums">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.total))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-[var(--border-default)] pt-2 text-sm font-bold">
          <span>Total</span>
          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(sale.sale.total))}</span>
        </div>
      </Card>
      <Alert tone="info">
        Ao finalizar, o estoque será baixado e o pagamento registrado. Confira os preços atuais antes
        de concluir — se algum preço mudou, o sistema informará.
      </Alert>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push("/pdv")}>Cancelar</Button>
        <Button onClick={() => void finalize()}>Finalizar com pagamento à vista</Button>
      </div>
    </div>
  );
}
