/**
 * Importação de clientes por CSV.
 *
 * Cabeçalho aceito (separador `;` ou `,`, com ou sem acento):
 *   nome, documento, telefone, whatsapp, email, nascimento, cidade, uf,
 *   endereco, numero, bairro, cep, limite, observacoes
 *
 * Regras (as mesmas da tela de cadastro, via `createCustomer`):
 *  - nome é obrigatório;
 *  - documento repetido não duplica: a linha é reportada e ignorada;
 *  - telefone/CEP/documento guardados só com dígitos;
 *  - limite de crédito aceita "1.500,00" ou "1500.00";
 *  - LGPD: o consentimento NÃO é presumido na importação — fica nulo e a tela
 *    informa quantos registros entraram sem consentimento.
 */
import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { ValidationError } from "@/server/lib/errors";
import { createCustomer } from "@/server/services/customers";
import { isValidCNPJ, isValidCPF, onlyDigits } from "@/lib/utils";

const MAX_LINHAS = 2000;

/** Cabeçalhos aceitos → campo interno. */
const COLUNAS: Record<string, string> = {
  nome: "nome",
  cliente: "nome",
  name: "nome",
  documento: "documento",
  cpf: "documento",
  cnpj: "documento",
  documento_fiscal: "documento",
  telefone: "telefone",
  fone: "telefone",
  celular: "telefone",
  whatsapp: "whatsapp",
  email: "email",
  e_mail: "email",
  email_contato: "email",
  nascimento: "nascimento",
  data_nascimento: "nascimento",
  aniversario: "nascimento",
  cidade: "cidade",
  uf: "uf",
  estado: "uf",
  endereco: "endereco",
  logradouro: "endereco",
  numero: "numero",
  bairro: "bairro",
  cep: "cep",
  limite: "limite",
  limite_credito: "limite",
  observacoes: "observacoes",
  observacao: "observacoes",
  notas: "observacoes",
};

const rowSchema = z.object({
  nome: z.string().trim().min(2, "Nome do cliente é obrigatório."),
  documento: z.string().trim().optional(),
  telefone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  email: z.string().trim().optional(),
  nascimento: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  uf: z.string().trim().optional(),
  endereco: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cep: z.string().trim().optional(),
  limite: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});

function normalizarCabecalho(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Quebra uma linha respeitando aspas (campo com `;` ou vírgula dentro). */
function quebrarLinha(linha: string, delimitador: string): string[] {
  const celulas: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (const c of linha) {
    if (c === '"') {
      entreAspas = !entreAspas;
      continue;
    }
    if (c === delimitador && !entreAspas) {
      celulas.push(atual);
      atual = "";
      continue;
    }
    atual += c;
  }
  celulas.push(atual);
  return celulas;
}

function parseCsv(texto: string): Array<Record<string, string>> {
  const limpo = texto.replace(/^\uFEFF/, "").trim();
  if (!limpo) return [];
  const linhas = limpo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const cabecalhoBruto = linhas[0] ?? "";
  // ";" é o padrão do Excel pt-BR; "," é o do CSV exportado por outros sistemas.
  const delimitador = cabecalhoBruto.includes(";") ? ";" : ",";
  const cabecalho = quebrarLinha(cabecalhoBruto, delimitador).map((h) => {
    const normalizado = normalizarCabecalho(h);
    return COLUNAS[normalizado] ?? normalizado;
  });

  return linhas.slice(1).map((linha) => {
    const celulas = quebrarLinha(linha, delimitador);
    const row: Record<string, string> = {};
    cabecalho.forEach((chave, i) => {
      row[chave] = (celulas[i] ?? "").trim();
    });
    return row;
  });
}

/** "1.500,00" | "1500.00" | "R$ 1.500" → 1500 */
function parseValor(texto?: string): number {
  if (!texto) return 0;
  const limpo = texto.replace(/[^\d.,-]/g, "");
  if (!limpo) return 0;
  const temVirgula = limpo.includes(",");
  const normalizado = temVirgula
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Documento da planilha → só dígitos, ou undefined quando não dá para confiar.
 *
 * Planilha real vem com CPF "123.456.789-09", mas também vem com "abc", "0" e
 * números comidos pelo Excel. Documento inválido NÃO entra: se entrasse zerado,
 * dois clientes diferentes colidiriam no mesmo documento e um deles seria
 * descartado como "duplicado" — pior do que não importar.
 */
function parseDocumento(texto?: string): { digits?: string; invalido?: string } {
  if (!texto) return {};
  const digits = onlyDigits(texto);
  if (!digits) return { invalido: `Documento ignorado (${texto.trim()}).` };
  if (digits.length === 11 && isValidCPF(digits)) return { digits };
  if (digits.length === 14 && isValidCNPJ(digits)) return { digits };
  return {
    invalido: `Documento ignorado: ${digits} não é um CPF/CNPJ válido.`,
  };
}

/** "31/12/1990" | "1990-12-31" → "1990-12-31" (date puro, sem fuso). */
function parseData(texto?: string): string | undefined {
  if (!texto) return undefined;
  const br = texto.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) {
    const [, dia, mes, ano] = br;
    const iso = `${ano}-${mes}-${dia}`;
    const d = new Date(`${iso}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? undefined : iso;
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(`${texto}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? undefined : texto;
  }
  return undefined;
}

export const POST = apiHandler(
  {
    permission: "customers.create",
    body: z.object({
      csv: z.string().min(1, "Envie o conteúdo do arquivo CSV."),
      /** Se falso, documento repetido vira erro; se verdadeiro, é ignorado. */
      ignoreDuplicates: z.boolean().optional().default(true),
    }),
  },
  async ({ body, user }) => {
    const actor = { id: user.id, name: user.name };
    const raw = parseCsv(body.csv);
    if (!raw.length) throw new ValidationError("O arquivo está vazio ou sem linhas de dados.");
    if (raw.length > MAX_LINHAS)
      throw new ValidationError(`Limite de ${MAX_LINHAS.toLocaleString("pt-BR")} linhas por importação.`);

    let criados = 0;
    let ignorados = 0;
    const erros: Array<{ line: number; message: string }> = [];

    for (let i = 0; i < raw.length; i++) {
      const linha = i + 2; // +1 do cabeçalho, +1 porque o usuário conta a partir de 1
      const parsed = rowSchema.safeParse(raw[i]);
      if (!parsed.success) {
        erros.push({ line: linha, message: parsed.error.issues[0]?.message ?? "Linha inválida." });
        continue;
      }
      const r = parsed.data;

      // E-mail malformado não impede o cadastro: é descartado com aviso.
      const emailValido = r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email);
      if (r.email && !emailValido) {
        erros.push({ line: linha, message: `E-mail inválido ignorado (${r.email}).` });
      }

      // Documento inválido é descartado (não vira "" e não bloqueia a linha).
      const doc = parseDocumento(r.documento);
      if (doc.invalido) erros.push({ line: linha, message: doc.invalido });

      // UF precisa existir; "ZZ" ou "SP - São Paulo" são descartados com aviso.
      const UF_VALIDAS = new Set([
        "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
        "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
      ]);
      const uf = (r.uf ?? "").toUpperCase().trim();
      const ufValida = UF_VALIDAS.has(uf) ? uf : undefined;
      if (uf && !ufValida) {
        erros.push({ line: linha, message: `UF ignorada (${r.uf}).` });
      }

      // Data de nascimento: se não der para ler, avisa em vez de perder calado.
      const nascimento = parseData(r.nascimento);
      if (r.nascimento && !nascimento) {
        erros.push({ line: linha, message: `Data de nascimento ignorada (${r.nascimento}).` });
      }

      try {
        await createCustomer(
          {
            name: r.nome,
            document: doc.digits,
            phone: r.telefone || undefined,
            whatsapp: r.whatsapp || r.telefone || undefined,
            email: emailValido ? r.email : undefined,
            birthDate: nascimento,
            city: r.cidade || undefined,
            state: ufValida,
            address: r.endereco || undefined,
            addressNumber: r.numero || undefined,
            district: r.bairro || undefined,
            zip: r.cep || undefined,
            creditLimit: parseValor(r.limite),
            notes: r.observacoes || undefined,
            // Sem consentimento presumido: importar não é consentir (LGPD).
            lgpdConsent: false,
          } as never,
          actor,
        );
        criados++;
      } catch (err) {
        const msg = (err as Error).message ?? "Falha ao cadastrar.";
        // Documento repetido é o caso esperado numa planilha real.
        if (/já existe|documento/i.test(msg) && body.ignoreDuplicates) {
          ignorados++;
          continue;
        }
        erros.push({ line: linha, message: msg });
      }
    }

    return ok({
      created: criados,
      skipped: ignorados,
      errors: erros.slice(0, 100),
      totalErrors: erros.length,
      // A tela usa isso para lembrar o lojista do consentimento LGPD.
      semConsentimento: criados,
    });
  },
);
