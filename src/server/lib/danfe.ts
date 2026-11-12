/**
 * DANFE simplificada (cupom da NFC-e) — HTML de 80 mm para impressora térmica.
 *
 * O que este documento É:
 *  - o cupom que o cliente leva, com os dados que a NFC-e exige mostrar
 *    (emitente, chave de acesso, protocolo, itens, tributos aproximados,
 *    consumidor, forma de pagamento);
 *  - a representação impressa do documento registrado no ERP.
 *
 * O que ele NÃO É:
 *  - autorização da SEFAZ. Sem provedor configurado, o documento fica PENDING e
 *    o cupom sai com a tarja "SEM VALOR FISCAL — DOCUMENTO PENDENTE DE
 *    AUTORIZAÇÃO". O sistema não finge emissão.
 *
 * A chave de acesso de 44 dígitos é a que veio do provedor (campo `access_key`).
 * Quando a integração ainda não devolveu a chave, mostramos o protocolo interno
 * e deixamos claro que se trata de pré-documento.
 */
import { brl, dateTimeBR } from "@/lib/utils";
import { esc } from "./comprovante";

export type DanfeItem = {
  sku: string | null;
  description: string;
  colorName?: string | null;
  sizeName?: string | null;
  quantity: number;
  unitPrice: string;
  total: string;
  ncm?: string | null;
  cfop?: string | null;
  csosn?: string | null;
};

export type DanfeData = {
  emitente: {
    nome: string;
    razaoSocial?: string | null;
    documento?: string | null;
    inscricaoEstadual?: string | null;
    endereco?: string | null;
    cidade?: string | null;
    uf?: string | null;
    telefone?: string | null;
  };
  documento: {
    modelo: "65" | "55";
    serie: number;
    numero: number;
    ambiente: "HOMOLOGATION" | "PRODUCTION";
    status: string;
    chaveAcesso?: string | null;
    protocolo?: string | null;
    emitidoEm?: Date | string | null;
    rejeicao?: string | null;
  };
  venda: { numero: number; total: string };
  consumidor?: { nome?: string | null; documento?: string | null } | null;
  itens: DanfeItem[];
  pagamentos: Array<{ method: string; amount: string; installments?: number }>;
  /** Valor aproximado dos tributos (Lei da Transparência). */
  tributosAproximados?: string | null;
  /** Mensagem de contingência/observação da loja. */
  observacao?: string | null;
  qrCodeUrl?: string | null;
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

const STATUS_TEXTO: Record<string, string> = {
  PENDING: "PENDENTE DE AUTORIZAÇÃO",
  AUTHORIZED: "AUTORIZADA",
  REJECTED: "REJEITADA",
  CANCELED: "CANCELADA",
  DENIED: "DENEGADA",
};

/** Formata a chave de acesso em grupos de 4 para leitura/confecção. */
export function formatarChave(chave: string): string {
  const limpa = chave.replace(/\D/g, "");
  return (limpa.match(/.{1,4}/g) ?? []).join(" ");
}

/**
 * Tarja de situação. AUTORIZADA só aparece quando o provedor devolveu
 * autorização de verdade; qualquer outro estado sai com aviso.
 */
function tarja(doc: DanfeData["documento"]): { texto: string; estilo: string } {
  if (doc.status === "AUTHORIZED") {
    return {
      texto: doc.ambiente === "HOMOLOGATION" ? "SEM VALOR FISCAL — HOMOLOGAÇÃO" : "DOCUMENTO AUTORIZADO",
      estilo: doc.ambiente === "HOMOLOGATION" ? "aviso" : "ok",
    };
  }
  if (doc.status === "CANCELED") return { texto: "DOCUMENTO CANCELADO", estilo: "aviso" };
  return { texto: "SEM VALOR FISCAL — PENDENTE DE AUTORIZAÇÃO", estilo: "aviso" };
}

const CSS_DANFE = `
  *{box-sizing:border-box}
  body{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:11px;color:#111;
       margin:0;padding:10px;width:80mm;line-height:1.4}
  h1{font-size:13px;text-align:center;margin:0 0 2px;letter-spacing:.5px;text-transform:uppercase}
  .center{text-align:center}
  .muted{color:#555}
  .xs{font-size:9.5px}
  .tarja{border:1px solid #111;padding:3px;margin:6px 0;text-align:center;font-weight:700;font-size:10px}
  .tarja.aviso{background:#f2f2f2}
  .tarja.ok{background:#e8f5e9}
  hr{border:0;border-top:1px dashed #999;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:1px 0}
  .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .item{border-bottom:1px dotted #ddd;padding:2px 0}
  .name{font-weight:600}
  .total{font-size:13px;font-weight:700}
  .chave{font-family:ui-monospace,monospace;letter-spacing:.3px;word-break:break-all;font-size:10px}
  .qrcode{display:block;margin:6px auto 0;width:38mm;height:38mm;image-rendering:pixelated}
  .foot{margin-top:8px;text-align:center;font-size:9px;color:#555}
  .actions{margin-top:12px;text-align:center}
  button{font:inherit;padding:6px 14px;border:1px solid #333;background:#fff;border-radius:4px;cursor:pointer}
  @media print{.actions{display:none}body{width:auto;padding:0}}
`;

export function danfeHtml(data: DanfeData): string {
  const { emitente, documento: doc } = data;
  const t = tarja(doc);
  const chave = doc.chaveAcesso?.replace(/\D/g, "") ?? "";

  const itens = data.itens
    .map((item) => {
      const grade = [item.colorName, item.sizeName].filter(Boolean).join(" / ");
      return `
        <div class="item">
          <div class="name">${esc(item.description)}</div>
          <div class="xs muted">
            ${item.sku ? `SKU ${esc(item.sku)}` : ""}${grade ? ` · ${esc(grade)}` : ""}
            ${item.ncm ? ` · NCM ${esc(item.ncm)}` : ""}
            ${item.cfop ? ` · CFOP ${esc(item.cfop)}` : ""}
            ${item.csosn ? ` · CSOSN ${esc(item.csosn)}` : ""}
          </div>
          <table>
            <tr>
              <td>${esc(item.quantity)} × ${esc(brl(item.unitPrice))}</td>
              <td class="r">${esc(brl(item.total))}</td>
            </tr>
          </table>
        </div>`;
    })
    .join("");

  const pagamentos = data.pagamentos
    .map((p) => {
      const parcelas = p.installments && p.installments > 1 ? ` (${p.installments}x)` : "";
      return `<tr><td>${esc(PAYMENT_LABEL[p.method] ?? p.method)}${parcelas}</td><td class="r">${esc(brl(p.amount))}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${doc.modelo === "65" ? "NFC-e" : "NF-e"} ${esc(doc.serie)}/${esc(doc.numero)} — venda ${esc(data.venda.numero)}</title>
<style>${CSS_DANFE}</style>
</head><body>
  <h1>${esc(emitente.nome)}</h1>
  <div class="center xs muted">
    ${emitente.razaoSocial ? `${esc(emitente.razaoSocial)}<br>` : ""}
    ${emitente.documento ? `CNPJ/CPF: ${esc(emitente.documento)}<br>` : ""}
    ${emitente.inscricaoEstadual ? `IE: ${esc(emitente.inscricaoEstadual)}<br>` : ""}
    ${emitente.endereco ? `${esc(emitente.endereco)}<br>` : ""}
    ${[emitente.cidade, emitente.uf].filter(Boolean).map((v) => esc(v)).join(" / ")}
    ${emitente.telefone ? `<br>${esc(emitente.telefone)}` : ""}
  </div>

  <div class="tarja ${t.estilo}">${t.texto}</div>

  <div class="center">
    <strong>${doc.modelo === "65" ? "DANFE Simplificado — NFC-e" : "DANFE — NF-e"}</strong><br>
    <span class="xs">Série ${esc(doc.serie)} · Número ${esc(doc.numero)}<br>
    ${doc.ambiente === "HOMOLOGATION" ? "Ambiente de homologação" : "Ambiente de produção"}<br>
    Emitido em ${esc(doc.emitidoEm ? dateTimeBR(doc.emitidoEm) : dateTimeBR(new Date()))}</span>
  </div>

  ${
    chave
      ? `<hr><div class="center xs">Chave de acesso</div>
         <div class="chave center">${esc(formatarChave(chave))}</div>
         ${doc.protocolo ? `<div class="center xs muted">Protocolo ${esc(doc.protocolo)}</div>` : ""}`
      : `<hr><div class="center xs muted">Documento interno sem chave de acesso (não transmitido à SEFAZ).</div>`
  }

  <hr>
  <table>
    <tr><td>Venda</td><td class="r">#${esc(data.venda.numero)}</td></tr>
    <tr><td>Situação</td><td class="r">${esc(STATUS_TEXTO[doc.status] ?? doc.status)}</td></tr>
    ${data.consumidor?.nome ? `<tr><td>Consumidor</td><td class="r">${esc(data.consumidor.nome)}</td></tr>` : `<tr><td>Consumidor</td><td class="r">Não identificado</td></tr>`}
    ${data.consumidor?.documento ? `<tr><td>CPF/CNPJ</td><td class="r">${esc(data.consumidor.documento)}</td></tr>` : ""}
  </table>

  <hr>
  ${itens || `<div class="center muted">Sem itens</div>`}
  <hr>
  <table>
    <tr><td class="total">TOTAL</td><td class="r total">${esc(brl(data.venda.total))}</td></tr>
  </table>
  ${pagamentos ? `<hr><table>${pagamentos}</table>` : ""}
  ${
    data.tributosAproximados
      ? `<hr><div class="xs">Valor aproximado dos tributos (Lei 12.741/2012): <strong>${esc(brl(data.tributosAproximados))}</strong></div>`
      : ""
  }
  ${doc.rejeicao ? `<hr><div class="xs">Retorno da SEFAZ: ${esc(doc.rejeicao)}</div>` : ""}
  ${data.observacao ? `<hr><div class="xs muted">${esc(data.observacao)}</div>` : ""}

  ${
    data.qrCodeUrl
      ? `<img class="qrcode" src="${esc(data.qrCodeUrl)}" alt="QR Code da nota">
         <div class="center xs muted">Consulte pela chave de acesso no portal da SEFAZ</div>`
      : ""
  }

  <div class="foot">
    ${doc.status === "AUTHORIZED" ? "Documento autorizado eletronicamente" : "Pré-documento gerado pelo ORION · não substitui a NFC-e"}<br>
    Obrigado pela preferência!
  </div>
  <div class="actions"><button onclick="window.print()">Imprimir</button></div>
</body></html>`;
}
