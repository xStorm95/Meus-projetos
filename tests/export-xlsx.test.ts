/**
 * Exportação em Excel (.xlsx) sem biblioteca externa.
 *
 * O arquivo tem de ser um ZIP de verdade com os XML que o Excel espera.
 * Aqui abrimos o binário gerado (via um leitor de ZIP mínimo, só com
 * `node:zlib`) e conferimos:
 *  - assinatura PK e diretório central consistentes;
 *  - os 6 arquivos obrigatórios do formato;
 *  - números como número (somáveis) e texto com acentos preservado;
 *  - cabeçalho congelado, autofiltro e coluna com largura definida.
 */
import { describe, expect, it } from "vitest";
import { xlsxResponse } from "../src/server/lib/export";

/** Lê um ZIP "stored" (método 0) devolvendo { nome → conteúdo }. */
function lerZipStored(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const arquivos = new Map<string, string>();

  // Acha o fim do diretório central (EOCD = 0x06054b50).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("EOCD não encontrado");

  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < total; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("cabeçalho central inválido");
    const tamanhoNome = view.getUint16(offset + 28, true);
    const tamanhoExtra = view.getUint16(offset + 30, true);
    const tamanhoComentario = view.getUint16(offset + 32, true);
    const offsetLocal = view.getUint32(offset + 42, true);
    const nome = dec.decode(bytes.slice(offset + 46, offset + 46 + tamanhoNome));

    if (view.getUint32(offsetLocal, true) !== 0x04034b50) throw new Error("cabeçalho local inválido");
    const tamanhoNomeLocal = view.getUint16(offsetLocal + 26, true);
    const tamanhoExtraLocal = view.getUint16(offsetLocal + 28, true);
    const tamanhoDados = view.getUint32(offsetLocal + 18, true);
    const inicio = offsetLocal + 30 + tamanhoNomeLocal + tamanhoExtraLocal;
    arquivos.set(nome, dec.decode(bytes.slice(inicio, inicio + tamanhoDados)));

    offset += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return arquivos;
}

async function gerar() {
  const res = xlsxResponse(
    "clientes.xlsx",
    ["Nome", "Total gasto", "Compras"],
    [
      ["Maria Silva", 1500.5, 12],
      ["João Souza", 0, 0],
      ["Acentuação ção & <tags>", 999.99, 3],
    ],
    { sheetName: "Clientes" },
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { res, bytes };
}

describe("exportação xlsx", () => {
  it("é um ZIP válido com os arquivos obrigatórios", async () => {
    const { bytes } = await gerar();
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K

    const arquivos = lerZipStored(bytes);
    for (const obrigatorio of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(arquivos.has(obrigatorio), `faltou ${obrigatorio}`).toBe(true);
    }
  });

  it("manda o Content-Type de planilha e nome de arquivo seguro", async () => {
    const { res } = await gerar();
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain("clientes.xlsx");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("número é número (somável) e texto preserva acento", async () => {
    const { bytes } = await gerar();
    const sheet = lerZipStored(bytes).get("xl/worksheets/sheet1.xml")!;

    // 1500.5 como valor numérico puro, sem virar texto
    expect(sheet).toContain("<v>1500.5</v>");
    expect(sheet).toContain("<v>12</v>");
    // acentos e caracteres especiais escapados, sem quebrar o XML
    expect(sheet).toContain("Acentuação ção &amp; &lt;tags&gt;");
    expect(sheet).not.toContain("<tags>");
  });

  it("tem cabeçalho congelado, autofiltro e largura definida", async () => {
    const { bytes } = await gerar();
    const sheet = lerZipStored(bytes).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain("<autoFilter");
    expect(sheet).toMatch(/<col min="1" max="1" width="\d+"/);
    // o cabeçalho usa o estilo 1 (negrito)
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
  });

  it("nome da aba sai no workbook", async () => {
    const { bytes } = await gerar();
    const wb = lerZipStored(bytes).get("xl/workbook.xml")!;
    expect(wb).toContain('name="Clientes"');
  });

  it("caracteres de controle são removidos (XML não aceita)", async () => {
    const res = xlsxResponse("t.xlsx", ["A"], [["lixo\u0000aqui\u0007"]]);
    const sheet = lerZipStored(new Uint8Array(await res.arrayBuffer())).get(
      "xl/worksheets/sheet1.xml",
    )!;
    expect(sheet).toContain("lixoaqui");
    expect(sheet).not.toContain("\u0000");
  });
});
