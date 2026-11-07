/**
 * Utilitários monetários — TODOS os cálculos de dinheiro passam por aqui.
 * Usa decimal.js para evitar erros de ponto flutuante (0.1 + 0.2 !== 0.3).
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -12, toExpPos: 21 });

export type MoneyInput = string | number | Decimal | null | undefined;

export function d(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;
  const n = new Decimal(value);
  if (!n.isFinite()) return new Decimal(0);
  return n;
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
