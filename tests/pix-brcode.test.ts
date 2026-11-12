/**
 * BR Code do Pix (EMV) — layout e CRC.
 *
 * O risco aqui não é "não compilar": é gerar um código que o banco recusa na
 * hora do pagamento. Estes testes travam o layout dos campos, o checksum e as
 * recusas (chave vazia, nome/cidade vazios, valor negativo).
 */
import { describe, expect, it } from "vitest";
import { conferirPayload, crc16, gerarPix, PixInvalido, textoPix } from "../src/server/lib/pix";

/** Lê os campos TLV de um payload (id + 2 dígitos de tamanho + valor). */
function campos(payload: string): Record<string, string> {
  const saida: Record<string, string> = {};
  let i = 0;
  while (i < payload.length - 4) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    saida[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return saida;
}

const base = {
  chave: "contato@orionerp.com.br",
  nome: "Ateliê Aurora",
  cidade: "Ipatinga",
};

describe("Pix — BR Code", () => {
  it("monta o payload com os campos obrigatórios", () => {
    const pix = gerarPix({ ...base, valor: 189.9, txid: "V2048" });
    const c = campos(pix.payload);

    expect(c["00"]).toBe("01"); // versão do payload
    expect(c["01"]).toBe("12"); // uso único (tem valor)
    expect(c["26"]).toContain("br.gov.bcb.pix");
    expect(c["26"]).toContain("contato@orionerp.com.br");
    expect(c["52"]).toBe("0000");
    expect(c["53"]).toBe("986"); // BRL
    expect(c["54"]).toBe("189.90");
    expect(c["58"]).toBe("BR");
    expect(c["59"]).toBe("ATELIE AURORA"); // sem acento, maiúsculas
    expect(c["60"]).toBe("IPATINGA");
    expect(c["62"]).toContain("V2048");
    expect(pix.payload.endsWith(pix.crc)).toBe(true);
  });

  it("o CRC confere (CRC16-CCITT, polinômio 0x1021)", () => {
    const pix = gerarPix({ ...base, valor: 10, txid: "1" });
    expect(conferirPayload(pix.payload).ok).toBe(true);

    // Um dígito trocado tem de ser detectado.
    const adulterado = pix.payload.slice(0, -1) + (pix.payload.endsWith("0") ? "1" : "0");
    expect(conferirPayload(adulterado).ok).toBe(false);
  });

  it("CRC conhecido: '123456789' em CRC16-CCITT-FALSE = 29B1", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("sem valor fica de uso múltiplo e sem o campo 54", () => {
    const pix = gerarPix({ ...base, valor: null });
    const c = campos(pix.payload);
    expect(c["01"]).toBe("11"); // pode ser reaproveitado
    expect(c["54"]).toBeUndefined();
    expect(pix.valor).toBeNull();
    expect(conferirPayload(pix.payload).ok).toBe(true);
  });

  it("sem txid usa '***' (exigência do padrão)", () => {
    const pix = gerarPix({ ...base, valor: 5 });
    expect(pix.txid).toBe("***");
    expect(campos(pix.payload)["62"]).toContain("***");
  });

  it("normaliza nome e cidade (sem acento, tamanho máximo)", () => {
    expect(textoPix("Ateliê Aurora & Cia", 25)).toBe("ATELIE AURORA CIA");
    expect(textoPix("São Paulo", 15)).toBe("SAO PAULO");
    expect(textoPix("a".repeat(40), 15)).toHaveLength(15);
    const pix = gerarPix({ chave: "123", nome: "Confecções São João Ltda ME", cidade: "Ribeirão Preto" });
    const c = campos(pix.payload);
    expect(c["59"].length).toBeLessThanOrEqual(25);
    expect(c["60"].length).toBeLessThanOrEqual(15);
  });

  it("recusa chave ausente, valor negativo e nome curto", () => {
    expect(() => gerarPix({ ...base, chave: "" })).toThrow(PixInvalido);
    expect(() => gerarPix({ ...base, valor: -1 })).toThrow(PixInvalido);
    expect(() => gerarPix({ ...base, nome: "A" })).toThrow(PixInvalido);
    expect(() => gerarPix({ ...base, cidade: "" })).toThrow(PixInvalido);
  });

  it("aceita CPF, telefone e chave aleatória", () => {
    for (const chave of [
      "12345678909",
      "+5533999990000",
      "123e4567-e89b-12d3-a456-426614174000",
    ]) {
      const pix = gerarPix({ ...base, chave, valor: 1 });
      expect(conferirPayload(pix.payload).ok).toBe(true);
      expect(campos(pix.payload)["26"]).toContain(chave);
    }
  });

  it("arredonda o valor para 2 casas", () => {
    expect(gerarPix({ ...base, valor: 10.005 }).payload).toContain("10.01");
    expect(gerarPix({ ...base, valor: 10.004 }).payload).toContain("10.00");
  });
});
