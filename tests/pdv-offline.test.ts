import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fila offline vive no localStorage do navegador. Aqui montamos um
 * localStorage de mentira ANTES de importar o módulo, porque ele checa
 * `typeof window` em tempo de chamada — mas queremos garantir que a regra de
 * negócio (o que pode ou não ficar na fila) está certa, sem precisar de browser.
 */

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const storage = new FakeStorage();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  dispatchEvent: () => true,
};

const { enfileirar, listarFila, removerDaFila, registrarFalha, sincronizarFila, bloqueioOffline, contarFila } =
  await import("@/lib/pdv-offline");

const resumo = { total: 120, itens: 2, cliente: null };

beforeEach(() => {
  storage.clear();
});

describe("fila de vendas offline", () => {
  it("guarda a venda com id local, horário e resumo para a tela", () => {
    const venda = enfileirar({ total: 120 }, resumo);
    expect(venda.id).toBeTruthy();
    expect(venda.tentativas).toBe(0);
    expect(Number.isNaN(Date.parse(venda.criadoEm))).toBe(false);

    const fila = listarFila();
    expect(fila).toHaveLength(1);
    expect(fila[0].resumo.total).toBe(120);
    expect(contarFila()).toBe(1);
  });

  it("mantém a ordem de chegada", () => {
    enfileirar({ n: 1 }, resumo);
    enfileirar({ n: 2 }, resumo);
    enfileirar({ n: 3 }, resumo);
    expect(listarFila().map((v) => (v.payload as { n: number }).n)).toEqual([1, 2, 3]);
  });

  it("remove só a venda pedida e deixa as outras", () => {
    const a = enfileirar({ n: 1 }, resumo);
    enfileirar({ n: 2 }, resumo);
    removerDaFila(a.id);
    expect(listarFila().map((v) => (v.payload as { n: number }).n)).toEqual([2]);
  });

  it("registra a falha sem descartar a venda", () => {
    const venda = enfileirar({ n: 1 }, resumo);
    registrarFalha(venda.id, "Estoque insuficiente");
    registrarFalha(venda.id, "Estoque insuficiente");
    const [salva] = listarFila();
    expect(salva.tentativas).toBe(2);
    expect(salva.ultimoErro).toBe("Estoque insuficiente");
  });

  it("envia em ordem e só tira da fila o que o servidor aceitou", async () => {
    enfileirar({ n: 1 }, resumo);
    const problematica = enfileirar({ n: 2 }, resumo);
    enfileirar({ n: 3 }, resumo);

    const enviar = vi.fn(async (payload: Record<string, unknown>) => {
      if (payload.n === 2) throw new Error("Estoque insuficiente");
      return { ok: true };
    });

    const resultado = await sincronizarFila(enviar);

    expect(resultado.enviadas).toBe(2);
    expect(resultado.falhas).toEqual([{ id: problematica.id, erro: "Estoque insuficiente" }]);
    // A venda problemática continua guardada: nada de sumir com venda do cliente.
    expect(listarFila().map((v) => (v.payload as { n: number }).n)).toEqual([2]);
    expect(listarFila()[0].tentativas).toBe(1);
    // Falha numa não trava as seguintes.
    expect(enviar.mock.calls.map((c) => (c[0] as { n: number }).n)).toEqual([1, 2, 3]);
  });

  it("não explode com dado corrompido no armazenamento", () => {
    storage.setItem("orion:pdv:fila-offline:v1", "{isso não é json");
    expect(listarFila()).toEqual([]);
    expect(contarFila()).toBe(0);
  });
});

describe("o que pode ser vendido offline", () => {
  it("venda à vista com uma forma de pagamento passa", () => {
    expect(bloqueioOffline({ payments: [{ method: "CASH" }] })).toBeNull();
    expect(bloqueioOffline({ payments: [{ method: "PIX" }] })).toBeNull();
  });

  it("crediário é bloqueado com motivo que o operador entende", () => {
    const motivo = bloqueioOffline({ payments: [{ method: "STORE_CREDIT" }] });
    expect(motivo).toMatch(/Crediário/);
    expect(motivo).toMatch(/servidor/);
  });

  it("pagamento dividido é bloqueado", () => {
    const motivo = bloqueioOffline({ payments: [{ method: "CASH" }, { method: "PIX" }] });
    expect(motivo).toMatch(/dividido/);
  });
});
