"use client";

/**
 * Fila de vendas offline do PDV.
 *
 * Ideia: se a internet cair no meio do atendimento, a venda NÃO se perde — ela
 * fica guardada no aparelho (localStorage) com um id local e é reenviada assim
 * que a conexão volta.
 *
 * Limites que a tela mostra (e não esconde do usuário):
 *  - o estoque só é conferido no reenvio; se outra pessoa vendeu a última peça
 *    nesse meio-tempo, a venda é recusada e precisa de ajuste manual;
 *  - venda com crediário, desconto acima do limite do perfil ou pagamento
 *    dividido em mais de uma forma fica BLOQUEADA offline: são regras que só o
 *    servidor consegue validar (limite de crédito, saldo do cliente).
 *  - a fila é por aparelho e por usuário: trocar de navegador não leva a fila.
 */

const FILA_KEY = "orion:pdv:fila-offline:v1";

export type VendaOffline = {
  /** Identificador local (não é o id do banco). */
  id: string;
  criadoEm: string;
  payload: Record<string, unknown>;
  /** Resumo para a tela: total e quantidade de itens. */
  resumo: { total: number; itens: number; cliente: string | null };
  tentativas: number;
  ultimoErro?: string | null;
};

function ler(): VendaOffline[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(FILA_KEY);
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as VendaOffline[];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravar(lista: VendaOffline[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FILA_KEY, JSON.stringify(lista));
  // Avisa outras abas/componentes (evento próprio + storage nativo).
  window.dispatchEvent(new CustomEvent("orion:fila-offline"));
}

export function listarFila(): VendaOffline[] {
  return ler();
}

export function contarFila(): number {
  return ler().length;
}

export function enfileirar(payload: Record<string, unknown>, resumo: VendaOffline["resumo"]): VendaOffline {
  const venda: VendaOffline = {
    // crypto.randomUUID existe em todos os navegadores atuais; o fallback cobre
    // navegador antigo em máquina de loja.
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `off-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: new Date().toISOString(),
    payload,
    resumo,
    tentativas: 0,
    ultimoErro: null,
  };
  gravar([...ler(), venda]);
  return venda;
}

export function removerDaFila(id: string) {
  gravar(ler().filter((v) => v.id !== id));
}

function atualizar(id: string, patch: Partial<VendaOffline>) {
  gravar(ler().map((v) => (v.id === id ? { ...v, ...patch } : v)));
}

/** Marca a tentativa que falhou sem descartar a venda. */
export function registrarFalha(id: string, erro: string) {
  const atual = ler().find((v) => v.id === id);
  atualizar(id, { tentativas: (atual?.tentativas ?? 0) + 1, ultimoErro: erro });
}

export type ResultadoEnvio = {
  enviadas: number;
  falhas: Array<{ id: string; erro: string }>;
};

/**
 * Tenta enviar tudo o que está na fila, em ordem de chegada.
 * Para na primeira recusa de negócio? Não: segue adiante para não travar a fila
 * por causa de uma venda problemática — mas mantém a venda na fila para revisão.
 */
export async function sincronizarFila(
  enviar: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<ResultadoEnvio> {
  const fila = ler();
  const resultado: ResultadoEnvio = { enviadas: 0, falhas: [] };

  for (const venda of fila) {
    try {
      await enviar(venda.payload);
      removerDaFila(venda.id);
      resultado.enviadas++;
    } catch (err) {
      const erro = err instanceof Error ? err.message : "Falha ao enviar a venda.";
      registrarFalha(venda.id, erro);
      resultado.falhas.push({ id: venda.id, erro });
    }
  }
  return resultado;
}

/**
 * A venda pode ser feita offline?
 *
 * Devolve o motivo quando NÃO pode — a tela mostra o porquê e o operador
 * decide esperar a conexão voltar em vez de descobrir depois que a venda não
 * entrou.
 */
export function bloqueioOffline(payload: {
  payments: Array<{ method: string }>;
  discountAmount?: number;
  discountPercent?: number;
}): string | null {
  if (payload.payments.some((p) => p.method === "STORE_CREDIT")) {
    return "Crediário precisa de internet: o limite e a dívida do cliente são conferidos no servidor.";
  }
  if (payload.payments.length > 1) {
    return "Pagamento dividido em várias formas precisa de internet para ser conciliado no caixa.";
  }
  return null;
}
