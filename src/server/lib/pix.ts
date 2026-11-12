/**
 * PIX — BR Code (EMV® QRCPS-MPM) estático, gerado no próprio servidor.
 *
 * Sem dependência externa e sem gateway: o lojista cadastra a chave e o ERP
 * monta o "copia e cola" + o QR. É o Pix por chave, do jeito que o cliente
 * final espera — o valor entra no caixa como qualquer outro pagamento.
 *
 * Formato (Banco Central, Manual do BR Code):
 *  00 Payload Format Indicator      "01"
 *  01 Point of Initiation Method    "11" estático / "12" de uso único
 *  26 Merchant Account Information  GUI "br.gov.bcb.pix", chave, (info extra)
 *  52 Merchant Category Code         "0000"
 *  53 Transaction Currency           "986" (BRL)
 *  54 Transaction Amount             "10.50" (sem casas? 2 sempre)
 *  58 Country Code                   "BR"
 *  59 Merchant Name                  máx. 25, sem acento
 *  60 Merchant City                  máx. 15, sem acento
 *  62 Additional Data Field          "05" + txid (máx. 25, "***" se vazio)
 *  63 CRC16-CCITT (0xFFFF)           "6304" + 4 hex
 *
 * Os nomes/cidades são normalizados (sem acento, maiúsculas) porque o padrão
 * não aceita acentuação — e é melhor cortar aqui do que ver o banco recusar.
 */

/** Remove acentos, cedilha e caracteres fora do ASCII imprimível. */
export function textoPix(valor: string, max: number): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** Campo EMV: id + tamanho em 2 dígitos + valor. */
function campo(id: string, valor: string): string {
  const tamanho = String(valor.length).padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

/**
 * CRC16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF) — o checksum exigido
 * pelo BR Code. Não confundir com o CRC32 do ZIP.
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixInput = {
  /** Chave Pix: CPF/CNPJ, e-mail, telefone (+55...) ou chave aleatória. */
  chave: string;
  nome: string;
  cidade: string;
  /** Valor em reais; vazio/zero gera QR de valor aberto (cliente digita). */
  valor?: number | string | null;
  /** Identificador da cobrança (nº da venda). Sem ele o padrão exige "***". */
  txid?: string | null;
};

export type PixResult = {
  payload: string;
  crc: string;
  /** Valor efetivamente embutido (null quando aberto). */
  valor: number | null;
  txid: string;
};

/** Motivo de recusa: a tela mostra o texto, nunca um QR que o banco vai negar. */
export class PixInvalido extends Error {}

/**
 * Monta o BR Code.
 * @throws PixInvalido quando a chave está vazia, com tamanho impossível ou
 *         quando nome/cidade ficam vazios depois da normalização.
 */
export function gerarPix(input: PixInput): PixResult {
  const chave = (input.chave ?? "").trim();
  if (!chave) throw new PixInvalido("Cadastre a chave Pix em Configurações → Pagamentos.");
  if (chave.length > 77) throw new PixInvalido("Chave Pix inválida (máximo de 77 caracteres).");

  const nome = textoPix(input.nome ?? "", 25);
  if (nome.length < 2) throw new PixInvalido("Cadastre o nome do recebedor (2 a 25 letras).");
  const cidade = textoPix(input.cidade ?? "", 15);
  if (!cidade) throw new PixInvalido("Cadastre a cidade do recebedor (até 15 letras).");

  const valorNumero =
    input.valor === null || input.valor === undefined || input.valor === ""
      ? null
      : Math.round(Number(input.valor) * 100) / 100;
  if (valorNumero !== null && (!Number.isFinite(valorNumero) || valorNumero < 0)) {
    throw new PixInvalido("Valor do Pix inválido.");
  }

  const txid = (input.txid ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 25) || "***";

  const merchantAccount =
    campo("00", "br.gov.bcb.pix") + campo("01", chave);

  let payload =
    campo("00", "01") +
    // 12 = uso único: o QR é de UMA venda, com valor. Sem valor, fica 11.
    campo("01", valorNumero !== null ? "12" : "11") +
    campo("26", merchantAccount) +
    campo("52", "0000") +
    campo("53", "986") +
    (valorNumero !== null ? campo("54", valorNumero.toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", txid));

  payload += "6304";
  const crc = crc16(payload);
  return { payload: payload + crc, crc, valor: valorNumero, txid };
}

/**
 * Validações de forma do payload gerado (usadas nos testes e como trava de
 * segurança antes de devolver para a tela).
 */
export function conferirPayload(payload: string): { ok: boolean; motivo?: string } {
  if (!payload.startsWith("000201")) return { ok: false, motivo: "Sem Payload Format Indicator." };
  if (!payload.includes("br.gov.bcb.pix")) return { ok: false, motivo: "Sem GUI do Pix." };
  if (!payload.includes("5802BR")) return { ok: false, motivo: "Sem país BR." };
  const crcDeclarado = payload.slice(-4);
  const crcCalculado = crc16(payload.slice(0, -4));
  if (crcDeclarado !== crcCalculado) {
    return { ok: false, motivo: `CRC não confere (${crcDeclarado} ≠ ${crcCalculado}).` };
  }
  return { ok: true };
}
