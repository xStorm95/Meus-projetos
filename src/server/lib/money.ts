/**
 * Utilitários monetários — TODOS os cálculos de dinheiro passam por aqui.
 * Usa decimal.js para evitar erros de ponto flutuante (0.1 + 0.2 !== 0.3).
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -12, toExpPos: 21 });

export type MoneyInput = string | number | Decimal | null | undefined;

/**
 * Converte texto digitado no padrão brasileiro para número.
 * Aceita "1.234,56", "1234,56", "R$ 99,90", "99.90", "1,5".
 * Regra: se há vírgula, ela é o separador decimal e os pontos são milhar.
 */
export function parseBRNumber(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  // Remove tudo que não é dígito, separador ou sinal.
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;

  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");

  if (s.includes(",")) {
    // Padrão brasileiro: ponto = milhar, vírgula = decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // "1.234.567" sem vírgula: pontos são milhar.
    s = s.replace(/\./g, "");
  }

  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return null;
  return negative ? `-${s}` : s;
}

/**
 * Converte qualquer entrada em Decimal. NUNCA lança exceção: valor inválido
 * vira 0, e texto no padrão brasileiro ("99,90") é entendido corretamente.
 * Isso é o que impede um campo mal digitado de virar "erro interno".
 */
export function d(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") return Number.isFinite(value) ? new Decimal(value) : new Decimal(0);

  const normalized = parseBRNumber(value);
  if (normalized === null) return new Decimal(0);
  try {
    const n = new Decimal(normalized);
    return n.isFinite() ? n : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Quantidade/medida (3 casas): mesma tolerância do dinheiro. */
export function qty(value: MoneyInput): Decimal {
  return d(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Texto digitado é um número válido? (para validar antes de gravar) */
export function isValidMoney(value: MoneyInput): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Decimal) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (value.trim() === "") return true;
  return parseBRNumber(value) !== null;
}

/** Arredonda para 2 casas (padrão monetário). */
export function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Converte para string com 2 casas, pronta para coluna numeric(14,2). */
export function money(value: MoneyInput): string {
  return round2(d(value)).toFixed(2);
}

/** Soma segura de valores monetários. */
export function sum(values: MoneyInput[]): string {
  return money(values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0)));
}

export function sub(a: MoneyInput, b: MoneyInput): string {
  return money(d(a).minus(d(b)));
}

export function mul(a: MoneyInput, b: MoneyInput): string {
  return money(d(a).times(d(b)));
}

export function div(a: MoneyInput, b: MoneyInput): string {
  const divisor = d(b);
  if (divisor.isZero()) return "0.00";
  return money(d(a).dividedBy(divisor));
}

export function pct(part: MoneyInput, total: MoneyInput): number {
  const t = d(total);
  if (t.isZero()) return 0;
  return round2(d(part).dividedBy(t).times(100)).toNumber();
}

export function max(a: MoneyInput, b: MoneyInput): string {
  return money(Decimal.max(d(a), d(b)));
}

export function isZero(v: MoneyInput): boolean {
  return d(v).isZero();
}

export function eq(a: MoneyInput, b: MoneyInput): boolean {
  return d(a).eq(d(b));
}

export function lte(a: MoneyInput, b: MoneyInput): boolean {
  return d(a).lte(d(b));
}

export function gt(a: MoneyInput, b: MoneyInput): boolean {
  return d(a).gt(d(b));
}

/** Formata em Real brasileiro. */
export function formatBRL(value: MoneyInput): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(d(value).toNumber());
}

/** Formata número no padrão brasileiro. */
export function formatNumber(value: number | string, decimals = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(typeof value === "string" ? Number(value) : value);
}

/**
 * Divide um total em N parcelas com distribuição de centavos correta.
 * Ex.: 100,00 em 3x => [33.34, 33.33, 33.33]
 */
export function splitInstallments(total: MoneyInput, installments: number): string[] {
  const n = Math.max(1, Math.trunc(installments));
  const amount = round2(d(total));
  const base = round2(amount.dividedBy(n)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const result: string[] = [];
  let allocated = new Decimal(0);
  for (let i = 0; i < n - 1; i++) {
    result.push(base.toFixed(2));
    allocated = allocated.plus(base);
  }
  result.push(round2(amount.minus(allocated)).toFixed(2));
  return result;
}

/**
 * Calcula juros e multa de uma parcela em atraso, segundo parâmetros
 * configurados (multa única + juros de mora diários, ambos percentuais).
 */
export function calculateLateCharges(params: {
  amount: MoneyInput;
  dueDate: Date | string;
  referenceDate?: Date;
  penaltyPercent: MoneyInput; // multa % sobre o valor
  dailyInterestPercent: MoneyInput; // % ao dia
  graceDays?: number;
}): { daysLate: number; penalty: string; interest: string; total: string } {
  const ref = params.referenceDate ?? new Date();
  const due = typeof params.dueDate === "string" ? parseDateOnly(params.dueDate) : params.dueDate;
  const msPerDay = 86_400_000;
  const daysLate = Math.max(
    0,
    Math.floor((startOfDayUTC(ref).getTime() - startOfDayUTC(due).getTime()) / msPerDay),
  );
  const effectiveDays = Math.max(0, daysLate - (params.graceDays ?? 0));
  const base = round2(d(params.amount));
  if (effectiveDays <= 0) {
    return { daysLate, penalty: "0.00", interest: "0.00", total: base.toFixed(2) };
  }
  const penalty = round2(base.times(d(params.penaltyPercent)).dividedBy(100));
  const interest = round2(
    base.times(d(params.dailyInterestPercent)).dividedBy(100).times(effectiveDays),
  );
  return {
    daysLate,
    penalty: penalty.toFixed(2),
    interest: interest.toFixed(2),
    total: round2(base.plus(penalty).plus(interest)).toFixed(2),
  };
}

/* ---------- helpers de data (sem dependência circular) ---------- */
export function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Converte 'YYYY-MM-DD' em Date local à meia-noite. */
export function parseDateOnly(value: string): Date {
  const [y, m, day] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}
