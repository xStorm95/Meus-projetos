/**
 * Pix da loja — monta o BR Code a partir das configurações.
 *
 * O que este serviço NÃO faz (e a tela diz isso): não confirma pagamento.
 * Confirmar Pix exige integração com PSP/banco (webhook assinado). O que existe
 * é o QR + copia e cola com o valor da venda, e o operador confere no app do
 * banco antes de finalizar — o mesmo fluxo de quem usa a chave na maquininha.
 */
import { gerarPix, PixInvalido } from "../lib/pix";
import { getSettingsCached } from "./settings";

export type PixDaVenda = {
  /** BR Code completo (vazio quando a configuração está incompleta). */
  payload: string;
  crc: string;
  valor: number | null;
  txid: string;
  recebedor: string;
  cidade: string;
  /** Falso quando a chave configurada não gera BR Code válido. */
  configurado: boolean;
  /** Motivo legível quando `configurado` é falso. */
  motivo?: string;
};

/** Configuração atual (sem gerar cobrança). */
export async function pixConfigurado(): Promise<{
  configurado: boolean;
  chave: string | null;
  recebedor: string;
  cidade: string;
}> {
  const settings = await getSettingsCached();
  const chave = settings.pixKey?.trim() || null;
  return {
    configurado: Boolean(chave && (settings.pixReceiverName || settings.companyName) && settings.pixCity),
    chave,
    recebedor: settings.pixReceiverName || settings.companyName || "",
    cidade: settings.pixCity || settings.companyCity || "",
  };
}

/**
 * BR Code com o valor da venda.
 *
 * `txid` é o identificador que o lojista vê no extrato; usamos o número da
 * venda (só dígitos/letras, até 25 caracteres, como o padrão exige).
 */
export async function pixDaVenda(params: {
  valor: number;
  vendaNumero?: number | string | null;
}): Promise<PixDaVenda> {
  const settings = await getSettingsCached();
  const chave = settings.pixKey?.trim() ?? "";
  const recebedor = settings.pixReceiverName || settings.companyName || "";
  const cidade = settings.pixCity || settings.companyCity || "";

  try {
    const pix = gerarPix({
      chave,
      nome: recebedor,
      cidade,
      valor: params.valor,
      txid: params.vendaNumero ? `VENDA${params.vendaNumero}` : undefined,
    });
    return { ...pix, recebedor, cidade, configurado: true };
  } catch (err) {
    if (err instanceof PixInvalido) {
      // Devolve o motivo para a tela — melhor um aviso claro do que um QR que
      // o banco do cliente vai recusar na hora do pagamento.
      return {
        payload: "",
        crc: "",
        valor: params.valor,
        txid: "",
        recebedor,
        cidade,
        configurado: false,
        motivo: err.message,
      };
    }
    throw err;
  }
}

/** Texto explicativo do que o ERP faz e do que não faz (usado na UI e nos testes). */
export const PIX_AVISO_CONFERENCIA =
  "O QR já vem com o valor da venda. Confirme o recebimento no app do banco antes de finalizar — o ORION não consulta o banco automaticamente.";
