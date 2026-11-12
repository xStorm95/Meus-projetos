/**
 * Gerador de QR Code (ISO/IEC 18004) em TypeScript puro.
 *
 * Por que não usar biblioteca: o projeto evita dependências novas para recursos
 * pequenos (mesma decisão do `.xlsx`), e o QR do Pix precisa ser gerado tanto no
 * servidor quanto no cliente. São ~250 linhas de algoritmo bem conhecido.
 *
 * Escopo: modo byte (UTF-8), correção de erro L/M/Q/H, versões 1 a 15 (até
 * 520 bytes em L / 412 em M / 328 em Q / 250 em H), máscara escolhida pela
 * penalidade padrão. Cobre o BR Code do Pix (tipicamente 80 a 200 bytes, até
 * ~300 com txid longo) em qualquer nível, inclusive H.
 *
 * A saída é a matriz de módulos (true = escuro). O desenho (SVG/canvas) fica em
 * `qr-svg.tsx`; separar os dois deixa a matriz testável contra vetores
 * conhecidos.
 */

export type NivelCorrecao = "L" | "M" | "Q" | "H";

/** Tabela de capacidade/estrutura por versão e nível (índice: L, M, Q, H). */
const NIVEL_INDICE: Record<NivelCorrecao, number> = { L: 0, M: 1, Q: 2, H: 3 };

/**
 * Estrutura dos blocos de correção — tabela 9 da ISO 18004.
 * versão → [L, M, Q, H] → lista de `[quantidade, codewords de dados, ecc]`.
 *
 * Por que a tabela completa num lugar só: as tentativas anteriores usaram duas
 * listas ("quantidade de blocos" e "ecc por bloco") e a primeira ficou
 * transposta a partir da versão 5 no nível L/Q (e H na 7). O QR saía bonito e
 * ilegível. Com a tabela do padrão única, não há o que desencontrar — e o teste
 * `qr-code` confere os codewords contra a referência do ZXing.
 */
const BLOCOS: number[][][][] = [
  /* 1 */ [[[1, 19, 7]], [[1, 16, 10]], [[1, 13, 13]], [[1, 9, 17]]],
  /* 2 */ [[[1, 34, 10]], [[1, 28, 16]], [[1, 22, 22]], [[1, 16, 28]]],
  /* 3 */ [[[1, 55, 15]], [[1, 44, 26]], [[2, 17, 18]], [[2, 13, 22]]],
  /* 4 */ [[[1, 80, 20]], [[2, 32, 18]], [[2, 24, 26]], [[4, 9, 16]]],
  /* 5 */ [[[1, 108, 26]], [[2, 43, 24]], [[2, 15, 18], [2, 16, 18]], [[2, 11, 22], [2, 12, 22]]],
  /* 6 */ [[[2, 68, 18]], [[4, 27, 16]], [[4, 19, 24]], [[4, 15, 28]]],
  /* 7 */ [[[2, 78, 20]], [[4, 31, 18]], [[2, 14, 18], [4, 15, 18]], [[4, 13, 26], [1, 14, 26]]],
  /* 8 */ [[[2, 97, 24]], [[2, 38, 22], [2, 39, 22]], [[4, 18, 22], [2, 19, 22]], [[4, 14, 26], [2, 15, 26]]],
  /* 9 */ [[[2, 116, 30]], [[3, 36, 22], [2, 37, 22]], [[4, 16, 20], [4, 17, 20]], [[4, 12, 24], [4, 13, 24]]],
  /* 10 */ [[[2, 68, 18], [2, 69, 18]], [[4, 43, 26], [1, 44, 26]], [[6, 19, 24], [2, 20, 24]], [[6, 15, 28], [2, 16, 28]]],
  /* 11 */ [[[4, 81, 20]], [[1, 50, 30], [4, 51, 30]], [[4, 22, 28], [4, 23, 28]], [[3, 12, 24], [8, 13, 24]]],
  /* 12 */ [[[2, 92, 24], [2, 93, 24]], [[6, 36, 22], [2, 37, 22]], [[4, 20, 26], [6, 21, 26]], [[7, 14, 28], [4, 15, 28]]],
  /* 13 */ [[[4, 107, 26]], [[8, 37, 22], [1, 38, 22]], [[8, 20, 24], [4, 21, 24]], [[12, 11, 22], [4, 12, 22]]],
  /* 14 */ [[[3, 115, 30], [1, 116, 30]], [[4, 40, 24], [5, 41, 24]], [[11, 16, 20], [5, 17, 20]], [[11, 12, 24], [5, 13, 24]]],
  /* 15 */ [[[5, 87, 22], [1, 88, 22]], [[5, 41, 24], [5, 42, 24]], [[5, 24, 30], [7, 25, 30]], [[11, 12, 24], [7, 13, 24]]],
];

/** Codewords de dados da versão/nível (soma dos blocos). */
function dadosDaVersao(versao: number, nivel: NivelCorrecao): number {
  return BLOCOS[versao - 1][NIVEL_INDICE[nivel]].reduce((acc, [qtd, dados]) => acc + qtd * dados, 0);
}


/**
 * Posições dos padrões de alinhamento.
 * ATENÇÃO: o índice é `versao - 1` (a linha 0 é a versão 1, que não tem
 * alinhamento). A última linha é a versão 10.
 */
const ALINHAMENTO: number[][] = [
  [], // 1
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38], // 7
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54], // 11
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66], // 14
  [6, 26, 48, 70], // 15
];

/**
 * Informação de formato (nível + máscara) já com os 15 bits do padrão.
 * Índices: nível L=0, M=1, Q=2, H=3 (mesma ordem de `formatBits` do padrão).
 */
const FORMATO: Record<NivelCorrecao, number[]> = {
  L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
  M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
  Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
  H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
};

/** Informação de versão (só a partir da 7) — 18 bits. */
const VERSAO_BITS: number[] = [
  0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x0e60d,
  0x0f928, 0x10b78, 0x1145d, 0x12a17, 0x13532, 0x149a6, 0x15683, 0x168c9, 0x177ec,
];

export class QrInvalido extends Error {}


/** Largura do QR (número de módulos) para uma versão: 21 + 4*(v-1). */
function tamanhoDaVersao(versao: number): number {
  return versao * 4 + 17;
}

/** Bytes de texto que cabem na versão/nível (4 bits de modo + contador). */
function capacidadeBytes(versao: number, nivel: NivelCorrecao): number {
  const contador = versao <= 9 ? 8 : 16;
  return Math.floor((dadosDaVersao(versao, nivel) * 8 - 4 - contador) / 8);
}

/** Escolhe a MENOR versão que caiba o texto. */
export function versaoPara(texto: string, nivel: NivelCorrecao = "M"): number {
  const bytes = new TextEncoder().encode(texto).length;
  for (let v = 1; v <= 15; v++) {
    if (bytes <= capacidadeBytes(v, nivel)) return v;
  }
  throw new QrInvalido(
    `Texto longo demais para QR (${bytes} bytes com correção ${nivel}). Máximo: ${capacidadeBytes(15, nivel)} bytes.`,
  );
}

/** Matriz quadrada de booleanos (true = módulo escuro). */
export type MatrizQr = boolean[][];

/** Monta a matriz com dados e padrões, mas SEM escolher máscara (uso em teste). */
export function matrizSemMascara(texto: string, nivel: NivelCorrecao = "M"): MatrizQr {
  const versao = versaoPara(texto, nivel);
  const size = tamanhoDaVersao(versao);
  const modulos: MatrizQr = Array.from({ length: size }, () => Array(size).fill(false));
  const funcao: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  desenharPadroesFixos(modulos, funcao, versao, size);
  const codewords = montarCodewords(texto, versao, nivel);
  desenharCodewords(modulos, funcao, codewords, size);
  return modulos;
}

/** Mapa de módulos de função (não recebem dados) — para depurar o posicionamento. */
export function mapaDeFuncao(texto: string, nivel: NivelCorrecao = "M"): boolean[][] {
  const versao = versaoPara(texto, nivel);
  const size = tamanhoDaVersao(versao);
  const modulos: MatrizQr = Array.from({ length: size }, () => Array(size).fill(false));
  const funcao: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  desenharPadroesFixos(modulos, funcao, versao, size);
  return funcao;
}

/** Códigos de dados já montados (bytes → RS → intercalado), para inspeção. */
export function codewordsDe(texto: string, nivel: NivelCorrecao = "M"): number[] {
  return montarCodewords(texto, versaoPara(texto, nivel), nivel);
}

export function gerarQr(texto: string, nivel: NivelCorrecao = "M"): MatrizQr {
  if (!texto) throw new QrInvalido("Nada para codificar.");
  const versao = versaoPara(texto, nivel);
  const size = tamanhoDaVersao(versao);

  const modulos: MatrizQr = Array.from({ length: size }, () => Array(size).fill(false));
  // Mapa de "é função" (não recebe dados). Sem isso os padrões seriam apagados.
  const funcao: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  desenharPadroesFixos(modulos, funcao, versao, size);
  const codewords = montarCodewords(texto, versao, nivel);
  desenharCodewords(modulos, funcao, codewords, size);

  // Escolhe a máscara de menor penalidade e fixa a informação de formato.
  let menorPenalidade = Infinity;
  let melhor: MatrizQr | null = null;
  for (let mascara = 0; mascara < 8; mascara++) {
    const copia = modulos.map((l) => l.slice());
    aplicarMascara(copia, funcao, mascara, size);
    desenharFormato(copia, nivel, mascara, size);
    const penalidade = calcularPenalidade(copia, size);
    if (penalidade < menorPenalidade) {
      menorPenalidade = penalidade;
      melhor = copia;
    }
  }
  return melhor!;
}

/* ------------------------------------------------------------------ */
/* Padrões fixos                                                       */
/* ------------------------------------------------------------------ */

function desenharPadroesFixos(modulos: MatrizQr, funcao: boolean[][], versao: number, size: number) {
  const por = (r: number, c: number, escuro: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modulos[r][c] = escuro;
    funcao[r][c] = true;
  };

  // Localizadores (3 cantos) com separador branco de 1 módulo.
  const localizador = (linha: number, coluna: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const dentro = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const borda = r === 0 || r === 6 || c === 0 || c === 6;
        const nucleo = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        por(linha + r, coluna + c, dentro && (borda || nucleo));
      }
    }
  };
  localizador(0, 0);
  localizador(0, size - 7);
  localizador(size - 7, 0);

  // Timing (linha/coluna 6).
  for (let i = 8; i < size - 8; i++) {
    por(6, i, i % 2 === 0);
    por(i, 6, i % 2 === 0);
  }

  // Alinhamento: 5x5 nos cruzamentos, exceto onde há localizador.
  // Índice por versão: a tabela começa na versão 1 (sem alinhamento).
  const posicoes = ALINHAMENTO[versao - 1];
  for (const r of posicoes) {
    for (const c of posicoes) {
      if (
        (r === 6 && c === 6) ||
        (r === 6 && c === posicoes[posicoes.length - 1]) ||
        (r === posicoes[posicoes.length - 1] && c === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const escuro = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          por(r + dr, c + dc, escuro);
        }
      }
    }
  }

  // Módulo escuro fixo.
  por(size - 8, 8, true);

  /*
   * Reserva as áreas de formato/versão (valor preenchido depois).
   * O índice 6 é PULADO: (8,6) e (6,8) são módulos do timing (sempre escuros)
   * e ficam no meio da área de formato. Zerá-los produz um QR que nenhum
   * leitor abre — o padrão manda pular essas duas posições.
   */
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    por(8, i, false);
    por(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    por(8, size - 1 - i, false);
    por(size - 1 - i, 8, false);
  }
  if (versao >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        por(size - 11 + j, i, false);
        por(i, size - 11 + j, false);
      }
    }
  }
}

function desenharFormato(modulos: MatrizQr, nivel: NivelCorrecao, mascara: number, size: number) {
  const bits = FORMATO[nivel][mascara];
  const bit = (i: number) => ((bits >> i) & 1) === 1;

  /*
   * ATENÇÃO à orientação: o padrão numera os bits em (coluna, linha).
   * Escrever transposto aqui gera um QR que parece perfeito a olho nu e que
   * nenhum leitor consegue decodificar (foi exatamente o primeiro bug deste
   * módulo). Conferido lendo o QR gerado com o ZXing.
   */

  // Cópia 1 (em volta do localizador superior esquerdo)
  for (let i = 0; i <= 5; i++) modulos[i][8] = bit(i);
  modulos[7][8] = bit(6);
  modulos[8][8] = bit(7);
  modulos[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) modulos[8][14 - i] = bit(i);

  // Cópia 2 (dividida entre os outros dois cantos)
  for (let i = 0; i <= 7; i++) modulos[8][size - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i++) modulos[size - 15 + i][8] = bit(i);
  // Módulo escuro fixo (sempre 1), ao lado da cópia 2.
  modulos[size - 8][8] = true;

  // Versão (a partir da 7)
  const versao = (size - 17) / 4;
  if (versao >= 7) {
    const vbits = VERSAO_BITS[versao - 7];
    for (let i = 0; i < 18; i++) {
      const escuro = ((vbits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      modulos[b][a] = escuro;
      modulos[a][b] = escuro;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Dados: bits → codewords → blocos com Reed-Solomon → intercalação     */
/* ------------------------------------------------------------------ */

function montarCodewords(texto: string, versao: number, nivel: NivelCorrecao): number[] {
  const dados = new TextEncoder().encode(texto);
  const bits: number[] = [];
  const push = (valor: number, quantidade: number) => {
    for (let i = quantidade - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  push(0b0100, 4); // modo byte
  // Contador de caracteres do modo byte: 8 bits até a versão 9, 16 depois.
  push(dados.length, versao <= 9 ? 8 : 16);
  for (const byte of dados) push(byte, 8);

  const totalBits = dadosDaVersao(versao, nivel) * 8;
  // Terminador (até 4 zeros) + preenchimento até o byte
  push(0, Math.min(4, totalBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Padrão de preenchimento: 0xEC, 0x11 alternados
  let pad = 0xec;
  while (codewords.length < totalBits / 8) {
    codewords.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  return intercalar(blocosComEcc(codewords, versao, nivel));
}

type Bloco = { dados: number[]; ecc: number[] };

function blocosComEcc(dados: number[], versao: number, nivel: NivelCorrecao): Bloco[] {
  const estrutura = BLOCOS[versao - 1][NIVEL_INDICE[nivel]];
  const blocos: Bloco[] = [];
  let pos = 0;
  for (const [qtd, porBloco, ecc] of estrutura) {
    for (let i = 0; i < qtd; i++) {
      const blocoDados = dados.slice(pos, pos + porBloco);
      pos += porBloco;
      blocos.push({ dados: blocoDados, ecc: reedSolomon(blocoDados, ecc) });
    }
  }
  return blocos;
}

/** Intercalação: uma coluna de dados de cada bloco, depois o ECC. */
function intercalar(blocos: Bloco[]): number[] {
  const saida: number[] = [];
  const maiorDados = Math.max(...blocos.map((b) => b.dados.length));
  for (let i = 0; i < maiorDados; i++) {
    for (const bloco of blocos) {
      if (i < bloco.dados.length) saida.push(bloco.dados[i]);
    }
  }
  for (let i = 0; i < blocos[0].ecc.length; i++) {
    for (const bloco of blocos) saida.push(bloco.ecc[i]);
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* Reed-Solomon (GF(256), polinômio 0x11D)                             */
/* ------------------------------------------------------------------ */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function inicializarGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function multiplicar(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Polinômio gerador de grau `grau`. */
function gerador(grau: number): number[] {
  let polinomio = [1];
  for (let i = 0; i < grau; i++) {
    const proximo = Array(polinomio.length + 1).fill(0);
    for (let j = 0; j < polinomio.length; j++) {
      proximo[j] ^= polinomio[j];
      proximo[j + 1] ^= multiplicar(polinomio[j], EXP[i]);
    }
    polinomio = proximo;
  }
  return polinomio;
}

function reedSolomon(dados: number[], ecclen: number): number[] {
  const g = gerador(ecclen);
  const resto = new Array(ecclen).fill(0);
  for (const byte of dados) {
    const fator = byte ^ resto.shift()!;
    resto.push(0);
    for (let i = 0; i < ecclen; i++) resto[i] ^= multiplicar(g[i + 1], fator);
  }
  return resto;
}

/* ------------------------------------------------------------------ */
/* Posicionamento dos dados + máscaras                                  */
/* ------------------------------------------------------------------ */

function desenharCodewords(modulos: MatrizQr, funcao: boolean[][], codewords: number[], size: number) {
  const bits: number[] = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  }
  let indice = 0;
  let paraCima = true;
  for (let coluna = size - 1; coluna > 0; coluna -= 2) {
    if (coluna === 6) coluna--; // pula a coluna de timing
    for (let i = 0; i < size; i++) {
      const linha = paraCima ? size - 1 - i : i;
      for (let j = 0; j < 2; j++) {
        const c = coluna - j;
        if (funcao[linha][c]) continue;
        modulos[linha][c] = indice < bits.length ? bits[indice] === 1 : false;
        indice++;
      }
    }
    paraCima = !paraCima;
  }
}

function aplicarMascara(modulos: MatrizQr, funcao: boolean[][], mascara: number, size: number) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (funcao[r][c]) continue;
      let inverter = false;
      switch (mascara) {
        case 0: inverter = (r + c) % 2 === 0; break;
        case 1: inverter = r % 2 === 0; break;
        case 2: inverter = c % 3 === 0; break;
        case 3: inverter = (r + c) % 3 === 0; break;
        case 4: inverter = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
        case 5: inverter = ((r * c) % 2) + ((r * c) % 3) === 0; break;
        case 6: inverter = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        case 7: inverter = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
      }
      if (inverter) modulos[r][c] = !modulos[r][c];
    }
  }
}

/** Penalidade do padrão (regras 1 a 4) — escolhe a máscara de melhor leitura. */
function calcularPenalidade(modulos: MatrizQr, size: number): number {
  let penalidade = 0;

  // Regra 1: sequências de 5+ módulos iguais.
  for (let i = 0; i < size; i++) {
    let runLinha = 1;
    let runColuna = 1;
    for (let j = 1; j < size; j++) {
      if (modulos[i][j] === modulos[i][j - 1]) runLinha++;
      else {
        if (runLinha >= 5) penalidade += 3 + (runLinha - 5);
        runLinha = 1;
      }
      if (modulos[j][i] === modulos[j - 1][i]) runColuna++;
      else {
        if (runColuna >= 5) penalidade += 3 + (runColuna - 5);
        runColuna = 1;
      }
    }
    if (runLinha >= 5) penalidade += 3 + (runLinha - 5);
    if (runColuna >= 5) penalidade += 3 + (runColuna - 5);
  }

  // Regra 2: blocos 2x2 da mesma cor.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modulos[r][c];
      if (v === modulos[r][c + 1] && v === modulos[r + 1][c] && v === modulos[r + 1][c + 1]) {
        penalidade += 3;
      }
    }
  }

  // Regra 3: padrão 1:1:3:1:1 (como nos localizadores) seguido de 4 claros.
  const padrao = [true, false, true, true, true, false, true];
  const corresponde = (get: (i: number) => boolean, inicio: number) =>
    padrao.every((v, k) => get(inicio + k) === v);
  for (let i = 0; i < size; i++) {
    const linha = (k: number) => modulos[i][k];
    const coluna = (k: number) => modulos[k][i];
    for (let j = 0; j + 7 <= size; j++) {
      for (const get of [linha, coluna]) {
        if (!corresponde(get, j)) continue;
        const antesLimpo = j >= 4 ? [1, 2, 3, 4].every((k) => !get(j - k)) : false;
        const depoisLimpo = j + 11 <= size ? [7, 8, 9, 10].every((k) => !get(j + k)) : false;
        if (antesLimpo || depoisLimpo) penalidade += 40;
      }
    }
  }

  // Regra 4: desequilíbrio entre escuros e claros.
  let escuros = 0;
  for (const linha of modulos) for (const v of linha) if (v) escuros++;
  const proporcao = (escuros * 100) / (size * size);
  penalidade += Math.floor(Math.abs(proporcao - 50) / 5) * 10;

  return penalidade;
}
