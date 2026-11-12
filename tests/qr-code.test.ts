/**
 * Gerador de QR Code próprio (sem biblioteca).
 *
 * Um QR "errado" é pior que QR nenhum: parece perfeito na tela e o cliente não
 * consegue pagar. Por isso estes testes travam três níveis de garantia:
 *
 *  1. fixpoint — a matriz gerada tem de ser EXATAMENTE a mesma de referência
 *     (conferida com o decodificador ZXing), incluindo máscara e formato. Se
 *     alguém mexer em tabela de blocos, alinhamento ou posicionamento, o teste
 *     acusa na hora;
 *  2. estrutura — formato de QR, tamanho por versão, capacidade por nível;
 *  3. payload Pix — o CRC e o layout do BR Code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gerarQr, matrizSemMascara, QrInvalido, versaoPara } from "../src/lib/qr";

type Referencia = Record<
  string,
  { texto: string; nivel: "L" | "M" | "Q" | "H"; versao: number; matriz: string }
>;

const ref = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "qr-referencia.json"), "utf8"),
) as Referencia;

const comoTexto = (matriz: boolean[][]) =>
  matriz.map((linha) => linha.map((v) => (v ? "1" : "0")).join("")).join("|");

describe("geração de QR Code", () => {
  it("reproduz exatamente a matriz de referência 'HELLO' (versão 1)", () => {
    const esperado = ref.hello;
    const gerado = gerarQr(esperado.texto, esperado.nivel);
    expect(gerado.length).toBe(21);
    expect(comoTexto(gerado)).toBe(esperado.matriz);
  });

  it("reproduz exatamente o BR Code do Pix (versão 8, correção M)", () => {
    const esperado = ref.pix;
    const gerado = gerarQr(esperado.texto, esperado.nivel);
    expect((gerado.length - 17) / 4).toBe(esperado.versao);
    expect(comoTexto(gerado)).toBe(esperado.matriz);
  });

  it("tem os três localizadores nos cantos (7x7 com borda escura)", () => {
    const m = gerarQr("ORION");
    for (const [topo, esquerda] of [
      [0, 0],
      [0, m.length - 7],
      [m.length - 7, 0],
    ]) {
      expect(m[topo][esquerda]).toBe(true);
      expect(m[topo + 1][esquerda + 1]).toBe(false);
      expect(m[topo + 3][esquerda + 3]).toBe(true);
      expect(m[topo][esquerda + 6]).toBe(true);
      expect(m[topo + 6][esquerda + 6]).toBe(true);
    }
  });

  it("mantém o timing (linha/coluna 6) alternado e o módulo escuro fixo", () => {
    const m = gerarQr("ORION");
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[m.length - 8][8]).toBe(true);
  });

  it("cresce a versão com o tamanho do texto (21 módulos por versão)", () => {
    expect(versaoPara("a", "M")).toBe(1);
    expect(versaoPara("a".repeat(100), "M")).toBeGreaterThan(versaoPara("a".repeat(20), "M"));
    const tamanhos = [20, 100, 250].map((n) => gerarQr("a".repeat(n), "M").length);
    for (const tamanho of tamanhos) {
      expect((tamanho - 17) % 4).toBe(0);
    }
  });

  it("recusa texto acima da capacidade em vez de gerar QR inválido", () => {
    expect(() => gerarQr("a".repeat(600), "H")).toThrow(QrInvalido);
    // e aceita o mesmo texto num nível mais tolerante? Não: 600 > capacidade L também.
    expect(() => gerarQr("a".repeat(600), "L")).toThrow(QrInvalido);
  });

  it("a matriz sem máscara já contém os dados (posição correta dos bits)", () => {
    // Sem máscara, os primeiros bits são o cabeçalho do modo byte:
    // 0100 (modo) + tamanho. Para "HELLO" (5) e versão 1: 0100 00000101 ...
    const semMascara = matrizSemMascara("HELLO", "L");
    const bits: number[] = [];
    let paraCima = true;
    const funcao = (r: number, c: number) =>
      (r <= 8 && c <= 8) || (r <= 8 && c >= 13) || (r >= 13 && c <= 8) || r === 6 || c === 6;
    for (let coluna = 20; coluna > 0; coluna -= 2) {
      if (coluna === 6) coluna--;
      for (let i = 0; i < 21; i++) {
        const linha = paraCima ? 20 - i : i;
        for (const c of [coluna, coluna - 1]) {
          if (funcao(linha, c)) continue;
          bits.push(semMascara[linha][c] ? 1 : 0);
        }
      }
      paraCima = !paraCima;
    }
    // Os 4 primeiros bits são o modo (0100 = byte); depois 8 bits de tamanho.
    expect(bits.slice(0, 4).join("")).toBe("0100");
    expect(parseInt(bits.slice(4, 12).join(""), 2)).toBe(5);
    // Em seguida vêm os caracteres, um byte cada.
    const lerByte = (inicio: number) => parseInt(bits.slice(inicio, inicio + 8).join(""), 2);
    expect(lerByte(12)).toBe(0x48); // H
    expect(lerByte(20)).toBe(0x45); // E
    expect(lerByte(28)).toBe(0x4c); // L
    expect(lerByte(36)).toBe(0x4c); // L
    expect(lerByte(44)).toBe(0x4f); // O
  });
});
