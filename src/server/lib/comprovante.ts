/**
 * Comprovantes em HTML (cupom não fiscal / fechamento de caixa).
 *
 * O botão "Comprovante" abre a rota em nova aba (`target="_blank"`), então a
 * resposta precisa ser HTML pronto para impressão — com CSS de 80mm, que é a
 * largura padrão de impressora térmica de PDV.
 *
 * Segurança: todo texto vindo do banco/usuário passa por `esc()`.
 * Nada aqui devolve dado de outra loja — a consulta que monta os dados roda
 * dentro do guardião multi-loja, como o resto da API.
 */
import { NextResponse } from "next/server";
import { brl, dateTimeBR } from "@/lib/utils";

/** Escapa texto para interpolar no HTML com segurança. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
  *{box-sizing:border-box}
  body{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;color:#111;
       margin:0;padding:10px;width:80mm;line-height:1.45}
  h1{font-size:13px;text-align:center;margin:0 0 2px;letter-spacing:.5px;text-transform:uppercase}
  .store{text-align:center;font-size:11px;margin-bottom:8px}
  .muted{color:#555}
  .center{text-align:center}
  hr{border:0;border-top:1px dashed #999;margin:8px 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:1px 0}
  .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .item{padding:3px 0;border-bottom:1px dotted #ddd}
  .name{font-weight:600}
  .total{font-size:14px;font-weight:700}
  .foot{margin-top:10px;text-align:center;font-size:10px;color:#555}
  .actions{margin-top:14px;text-align:center}
  button{font:inherit;padding:6px 14px;border:1px solid #333;background:#fff;border-radius:4px;cursor:pointer}
  .badge{display:inline-block;border:1px solid #333;border-radius:3px;padding:0 4px;font-size:10px}
  @media print{.actions{display:none}body{width:auto;padding:0}}
`;

export function htmlResponse(html: string) {
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* ============================ COMPROVANTE DE VENDA ============================ */

export type ReceiptData = {
  storeName: string;
  storeDocument?: string | null;
  storePhone?: string | null;
  storeAddress?: string | null;
  sale: {
    number: number;
    status: string;
    createdAt: Date | string;
    subtotal: string;
    discountAmount: string;
    discountPercent?: string;
    surchargeAmount?: string;
    total: string;
    paidAmount: string;
    changeAmount: string;
    notes?: string | null;
    cancelReason?: string | null;
  };
  customerName?: string | null;
  customerDocument?: string | null;
  sellerName?: string | null;
  items: Array<{
    description: string;
    sku?: string | null;
    colorName?: string | null;
    sizeName?: string | null;
    quantity: string | number;
    unitPrice: string;
    discountAmount?: string;
    total: string;
  }>;
  payments: Array<{ method: string; amount: string; installments?: number | null }>;
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  TRANSFER: "Transferência",
  STORE_CREDIT: "Crediário da loja",
  CHECK: "Cheque",
  OTHER: "Outro",
};

export function saleReceiptHtml(data: ReceiptData): string {
  const s = data.sale;
  const cancelada = s.status === "CANCELED";

  const itens = data.items
    .map((i) => {
      const grade = [i.colorName, i.sizeName].filter(Boolean).join(" / ");
      return `
        <div class="item">
          <div class="name">${esc(i.description)}</div>
          <div class="muted">${esc(i.sku ?? "")}${grade ? ` · ${esc(grade)}` : ""}</div>
          <table>
            <tr>
              <td>${esc(i.quantity)} × ${esc(brl(i.unitPrice))}</td>
              <td class="r">${esc(brl(i.total))}</td>
            </tr>
            ${Number(i.discountAmount ?? 0) > 0 ? `<tr><td class="muted">Desconto no item</td><td class="r muted">− ${esc(brl(i.discountAmount))}</td></tr>` : ""}
          </table>
        </div>`;
    })
    .join("");

  const pagamentos = data.payments
    .map((p) => {
      const parcelas = p.installments && p.installments > 1 ? ` (${p.installments}x)` : "";
      return `<tr><td>${esc(PAYMENT_LABEL[p.method] ?? p.method)}${parcelas}</td><td class="r">${esc(brl(p.amount))}</td></tr>`;
    })
    .join("");

  const desconto = Number(s.discountAmount ?? 0);
  const acrescimo = Number(s.surchargeAmount ?? 0);

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprovante — venda ${esc(s.number)}</title>
<style>${CSS}</style>
</head><body>
  <h1>${esc(data.storeName)}</h1>
  <div class="store muted">
    ${data.storeDocument ? `CNPJ/CPF: ${esc(data.storeDocument)}<br>` : ""}
    ${data.storePhone ? `${esc(data.storePhone)}<br>` : ""}
    ${data.storeAddress ? `${esc(data.storeAddress)}<br>` : ""}
  </div>

  ${cancelada ? `<div class="center badge">VENDA CANCELADA</div>` : ""}

  <div class="center"><strong>Comprovante não fiscal</strong></div>
  <hr>
  <table>
    <tr><td>Venda</td><td class="r">#${esc(s.number)}</td></tr>
    <tr><td>Data</td><td class="r">${esc(dateTimeBR(s.createdAt))}</td></tr>
    ${data.sellerName ? `<tr><td>Vendedor</td><td class="r">${esc(data.sellerName)}</td></tr>` : ""}
    ${data.customerName ? `<tr><td>Cliente</td><td class="r">${esc(data.customerName)}</td></tr>` : ""}
    ${data.customerDocument ? `<tr><td>Documento</td><td class="r">${esc(data.customerDocument)}</td></tr>` : ""}
  </table>
  <hr>
  ${itens || `<div class="center muted">Sem itens</div>`}
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${esc(brl(s.subtotal))}</td></tr>
    ${desconto > 0 ? `<tr><td>Desconto${Number(s.discountPercent ?? 0) > 0 ? ` (${esc(s.discountPercent)}%)` : ""}</td><td class="r">− ${esc(brl(desconto))}</td></tr>` : ""}
    ${acrescimo > 0 ? `<tr><td>Acréscimo</td><td class="r">${esc(brl(acrescimo))}</td></tr>` : ""}
    <tr><td class="total">TOTAL</td><td class="r total">${esc(brl(s.total))}</td></tr>
  </table>
  ${
    pagamentos
      ? `<hr><table>${pagamentos}
          <tr><td>Pago</td><td class="r">${esc(brl(s.paidAmount))}</td></tr>
          ${Number(s.changeAmount ?? 0) > 0 ? `<tr><td>Troco</td><td class="r">${esc(brl(s.changeAmount))}</td></tr>` : ""}
         </table>`
      : ""
  }
  ${s.notes ? `<hr><div class="muted">Obs.: ${esc(s.notes)}</div>` : ""}
  ${cancelada && s.cancelReason ? `<hr><div class="muted">Motivo do cancelamento: ${esc(s.cancelReason)}</div>` : ""}

  <div class="foot">
    Documento sem valor fiscal<br>
    Obrigado pela preferência!
  </div>
  <div class="actions"><button onclick="window.print()">Imprimir</button></div>
</body></html>`;
}

/* ============================ FECHAMENTO DE CAIXA ============================ */

export type CashReportData = {
  storeName: string;
  operatorName?: string | null;
  session: {
    id: string;
    openedAt: Date | string;
    closedAt?: Date | string | null;
    openingAmount: string;
    closingAmount?: string | null;
    countedAmount?: string | null;
    expectedAmount?: string | null;
    difference?: string | null;
    status: string;
    notes?: string | null;
  };
  summary: {
    salesCount: number;
    salesTotal: string;
    cashIn?: string;
    cashOut?: string;
    byPayment?: Array<{ method: string; total: string; count: number }>;
  };
  movements?: Array<{ kind: string; amount: string; reason?: string | null; at: Date | string }>;
};

/** Formata dinheiro que pode vir como somatório (string do Postgres). */
function safeBRL(v: unknown): string {
  return brl(String(v ?? "0"));
}

export function cashReportHtml(data: CashReportData): string {
  const s = data.session;
  const aberto = s.status === "OPEN";
  const diferenca = Number(s.difference ?? 0);

  const pagamentos = (data.summary.byPayment ?? [])
    .map(
      (p) =>
        `<tr><td>${esc(PAYMENT_LABEL[p.method] ?? p.method)}</td><td class="r">${p.count}x</td><td class="r">${esc(safeBRL(p.total))}</td></tr>`,
    )
    .join("");

  const movimentos = (data.movements ?? [])
    .map(
      (m) =>
        `<tr><td>${esc(m.kind === "IN" || m.kind === "SUPRIMENTO" ? "Entrada" : "Saída")}</td>
             <td class="r">${esc(safeBRL(m.amount))}</td></tr>
         <tr><td colspan="2" class="muted" style="padding-bottom:4px">${esc(m.reason ?? "")}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fechamento de caixa</title>
<style>${CSS}</style>
</head><body>
  <h1>${esc(data.storeName)}</h1>
  <div class="center"><strong>${aberto ? "Resumo do caixa (aberto)" : "Fechamento de caixa"}</strong></div>
  <hr>
  <table>
    <tr><td>Abertura</td><td class="r">${esc(dateTimeBR(s.openedAt))}</td></tr>
    ${s.closedAt ? `<tr><td>Fechamento</td><td class="r">${esc(dateTimeBR(s.closedAt))}</td></tr>` : ""}
    ${data.operatorName ? `<tr><td>Operador</td><td class="r">${esc(data.operatorName)}</td></tr>` : ""}
    <tr><td>Fundo de troco</td><td class="r">${esc(safeBRL(s.openingAmount))}</td></tr>
  </table>
  <hr>
  <table>
    <tr><td>Vendas</td><td class="r">${esc(data.summary.salesCount)}</td></tr>
    <tr><td>Total vendido</td><td class="r">${esc(safeBRL(data.summary.salesTotal))}</td></tr>
    ${data.summary.cashIn !== undefined ? `<tr><td>Suprimentos</td><td class="r">${esc(safeBRL(data.summary.cashIn))}</td></tr>` : ""}
    ${data.summary.cashOut !== undefined ? `<tr><td>Sangrias</td><td class="r">${esc(safeBRL(data.summary.cashOut))}</td></tr>` : ""}
  </table>
  ${pagamentos ? `<hr><div class="muted">Recebimentos por forma</div><table>${pagamentos}</table>` : ""}
  ${movimentos ? `<hr><div class="muted">Movimentos</div><table>${movimentos}</table>` : ""}
  <hr>
  <table>
    <tr><td>Esperado na gaveta</td><td class="r">${esc(safeBRL(s.expectedAmount))}</td></tr>
    <tr><td>Contado</td><td class="r">${esc(safeBRL(s.countedAmount ?? s.closingAmount))}</td></tr>
    <tr><td class="total">Diferença</td>
        <td class="r total">${diferenca === 0 ? "—" : `${diferenca > 0 ? "+" : "−"} ${esc(safeBRL(Math.abs(diferenca)))}`}</td></tr>
  </table>
  ${s.notes ? `<hr><div class="muted">Obs.: ${esc(s.notes)}</div>` : ""}
  <div class="foot">Emitido em ${esc(dateTimeBR(new Date()))}</div>
  <div class="actions"><button onclick="window.print()">Imprimir</button></div>
</body></html>`;
}
