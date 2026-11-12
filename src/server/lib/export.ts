/**
 * Geração de arquivos de exportação (CSV / JSON) no servidor.
 * CSV em UTF-8 com BOM e separador ";" — abre corretamente no Excel pt-BR.
 */
import { NextResponse } from "next/server";

export type CsvValue = string | number | boolean | null | undefined;

function escapeCsv(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  // Números decimais usam vírgula no padrão pt-BR do Excel
  const text = raw.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return /[";\n]/.test(text) ? `"${text}"` : text;
}

export function toCSV(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeCsv).join(";"), ...rows.map((row) => row.map(escapeCsv).join(";"))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Valor monetário/número já formatado com vírgula decimal (pt-BR). */
export function csvNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2).replace(".", ",");
}

export function csvDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10).split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function csvDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return fmt.replace(",", "");
}

export function fileResponse(filename: string, body: string, contentType: string) {
  const safeName = filename.replace(/[^\w.\-]+/g, "-");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "no-store",
    },
  });
}

export function csvResponse(filename: string, headers: string[], rows: CsvValue[][]) {
  return fileResponse(filename, toCSV(headers, rows), "text/csv; charset=utf-8");
}

export function jsonResponse(filename: string, data: unknown) {
  return fileResponse(filename, JSON.stringify(data, null, 2), "application/json; charset=utf-8");
}

/* ============================================================
 * EXCEL (.xlsx)
 *
 * Sem biblioteca nova: um .xlsx é um ZIP com alguns XML. Escrevemos o ZIP
 * "stored" (sem compressão) — válido para o Excel, Google Sheets e LibreOffice,
 * e sem dependência de compressão nativa na Vercel.
 *
 * Um único módulo `lib/sheets.ts` expõe `planilha(...)`; as rotas de exportação
 * ganham `format=xlsx` reaproveitando as MESMAS linhas do CSV.
 * ============================================================ */

/** ZIP mínimo (método 0 = stored) com os arquivos informados. */
export function construirZip(arquivos: Array<{ nome: string; conteudo: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const tabelaCrc = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = tabelaCrc[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

  for (const { nome, conteudo } of arquivos) {
    const nomeBytes = encoder.encode(nome); // nomes são ASCII de propósito
    const dados = encoder.encode(conteudo);
    const crc = crc32(dados);

    // Cabeçalho local
    const local = [
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(dados.length), u32(dados.length),
      u16(nomeBytes.length), u16(0), nomeBytes,
    ];
    const localBytes = concat(local);
    partes.push(localBytes, dados);

    // Diretório central
    central.push(
      concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(dados.length), u32(dados.length),
        u16(nomeBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(offset), nomeBytes,
      ]),
    );
    offset += localBytes.length + dados.length;
  }

  const centralBytes = concat(central);
  const fim = concat([
    u32(0x06054b50), u16(0), u16(0), u16(arquivos.length), u16(arquivos.length),
    u32(centralBytes.length), u32(offset), u16(0),
  ]);

  return concat([...partes, centralBytes, fim]);
}

function concat(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((acc, p) => acc + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

function xmlEscape(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de controle não são permitidos no XML.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Coluna 0 → A, 25 → Z, 26 → AA. */
function coluna(indice: number): string {
  let n = indice;
  let nome = "";
  do {
    nome = String.fromCharCode(65 + (n % 26)) + nome;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return nome;
}

/**
 * Valor de célula: número vira número (para somar no Excel), texto vira texto.
 * Strings no padrão pt-BR ("1.234,56") NÃO são convertidas — quem chama deve
 * passar números pequenos ou já formatar como texto de propósito.
 */
function celula(valor: CsvValue, ref: string): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${ref}"><v>${valor}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(valor)}</t></is></c>`;
}

/**
 * Monta um `.xlsx` de uma planilha.
 * - primeira linha em negrito e congelada;
 * - largura de coluna calculada pelo conteúdo (limite de 60);
 * - cabeçalho repetido por padrão (útil em listas longas).
 */
export function xlsxResponse(
  filename: string,
  headers: string[],
  rows: CsvValue[][],
  opts: { sheetName?: string } = {},
) {
  const aba = (opts.sheetName ?? "Dados").replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Dados";
  const todas = [headers, ...rows];

  const larguras = headers.map((h, i) => {
    const maior = todas.reduce((acc, linha) => {
      const v = linha[i];
      const len = v === null || v === undefined ? 0 : String(v).length;
      return Math.max(acc, len);
    }, String(h).length);
    return Math.min(60, Math.max(10, maior + 2));
  });

  const xmlLinhas = todas
    .map((linha, r) => {
      const num = r + 1;
      const estilo = r === 0 ? ' s="1"' : "";
      const celulas = linha
        .map((valor, c) => {
          const ref = `${coluna(c)}${num}`;
          if (r === 0) {
            return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xmlEscape(valor)}</t></is></c>`;
          }
          void estilo;
          return celula(valor, ref);
        })
        .join("");
      return `<row r="${num}">${celulas}</row>`;
    })
    .join("");

  const cols = larguras
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${xmlLinhas}</sheetData>
<autoFilter ref="A1:${coluna(Math.max(0, headers.length - 1))}1"/>
</worksheet>`;

  const arquivos = [
    {
      nome: "[Content_Types].xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(aba)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      nome: "xl/styles.xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`,
    },
    { nome: "xl/worksheets/sheet1.xml", conteudo: sheet },
  ];

  const zip = construirZip(arquivos);
  const safeName = filename.replace(/[^\w.\-]+/g, "-");
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "no-store",
    },
  });
}
