/**
 * Utilitários de data/hora.
 * Regra do sistema: datas de NEGÓCIO (vencimento, competência, nascimento)
 * são persistidas como DATE puro, sem hora, para evitar problemas de fuso.
 * Datas de EVENTO (venda, movimento) são timestamptz em UTC e exibidas em
 * America/Sao_Paulo.
 */
export const TZ = "America/Sao_Paulo";

/**
 * FUSO — a regra do sistema.
 *
 * O banco guarda timestamptz em UTC, mas o "dia comercial" é o de São Paulo.
 * Antes, `todayKey()` e `rangeToTimestamps()` montavam as datas em UTC:
 *   - às 21h de Brasília o servidor (UTC) já estava no dia seguinte, então
 *     "hoje" e "este mês" apontavam para o dia errado;
 *   - uma venda feita às 22h de 31/01 caía em 01/02.
 * Era isso que fazia o card do período mostrar R$ 600,00 e o card do mês
 * mostrar R$ 0,00 no dashboard.
 */

/** Partes de data (ano, mês, dia) no fuso da loja, para um instante qualquer. */
function partesEmSaoPaulo(date: Date = new Date()): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(date).split("-").map(Number);
  return { y, m, d };
}

/** Retorna a data no formato YYYY-MM-DD (horário local do servidor/loja). */
export function toDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    // já no formato YYYY-MM-DD?
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return formatDateKey(parsed);
  }
  return formatDateKey(value);
}

function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Data de HOJE como YYYY-MM-DD **no fuso da loja** (America/Sao_Paulo).
 *
 * Não use `new Date()` direto: em produção o processo roda em UTC e, à noite,
 * o dia já virou. Toda a regra de período do sistema parte daqui.
 */
export function todayKey(now: Date = new Date()): string {
  const { y, m, d } = partesEmSaoPaulo(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDaysKey(base: string | Date, days: number): string {
  const date = typeof base === "string" ? new Date(`${base}T00:00:00Z`) : new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

export function addMonthsKey(base: string | Date, months: number): string {
  const date = typeof base === "string" ? new Date(`${base}T00:00:00Z`) : new Date(base);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, daysInMonth));
  return formatDateKey(date);
}

export function startOfMonthKey(reference: string | Date = new Date()): string {
  const date = typeof reference === "string" ? new Date(`${reference}T00:00:00Z`) : reference;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function endOfMonthKey(reference: string | Date = new Date()): string {
  const date = typeof reference === "string" ? new Date(`${reference}T00:00:00Z`) : reference;
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return formatDateKey(last);
}

export function startOfWeekKey(reference: string | Date = new Date()): string {
  const date = typeof reference === "string" ? new Date(`${reference}T00:00:00Z`) : reference;
  const day = date.getUTCDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day; // segunda-feira como início
  return addDaysKey(formatDateKey(date), diff);
}

/**
 * Deslocamento do fuso da loja em relação a UTC, em horas (Brasil: -3, sem
 * horário de verão desde 2019). É o que converte "dia da loja" em instante.
 */
const OFFSET_HORAS = -3;

/**
 * Instante em que o dia começa no fuso da loja.
 * `2026-11-07` → `2026-11-07T03:00:00.000Z`.
 */
export function inicioDoDia(fromKey: string): Date {
  return new Date(`${fromKey}T${String(-OFFSET_HORAS).padStart(2, "0")}:00:00.000Z`);
}

/**
 * Intervalo de datas para uso em timestamptz: início inclusivo, fim exclusivo,
 * **no fuso da loja**. `from=2026-11-01, to=2026-11-07` pega de
 * 01/11 00:00 (03:00Z) até 07/11 23:59:59.999 (08/11 03:00Z).
 */
export function rangeToTimestamps(fromKey: string, toKey: string): { gte: Date; lt: Date } {
  return {
    gte: inicioDoDia(fromKey),
    lt: inicioDoDia(addDaysKey(toKey, 1)),
  };
}

/** Formata DD/MM/AAAA. */
export function formatDateBR(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const key = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : toDateOnly(value);
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/** Formata DD/MM/AAAA HH:mm (horário de São Paulo). */
export function formatDateTimeBR(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTimeBR(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ageFromBirthDate(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(`${toDateOnly(birth)}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = new Date(typeof a === "string" ? `${toDateOnly(a)}T00:00:00Z` : a.toISOString());
  const db = new Date(typeof b === "string" ? `${toDateOnly(b)}T00:00:00Z` : b.toISOString());
  return Math.floor((db.getTime() - da.getTime()) / 86_400_000);
}

export function isBirthdayThisMonth(birth: string | null | undefined, month = new Date()): boolean {
  if (!birth) return false;
  return Number(toDateOnly(birth).slice(5, 7)) === month.getUTCMonth() + 1;
}

/** Presets de período usados no dashboard e relatórios. */
export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

export function resolvePeriod(
  preset: PeriodPreset,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string; label: string } {
  const today = todayKey();
  switch (preset) {
    case "today":
      return { from: today, to: today, label: "Hoje" };
    case "yesterday": {
      const y = addDaysKey(today, -1);
      return { from: y, to: y, label: "Ontem" };
    }
    case "last7":
      return { from: addDaysKey(today, -6), to: today, label: "Últimos 7 dias" };
    case "last30":
      return { from: addDaysKey(today, -29), to: today, label: "Últimos 30 dias" };
    case "thisMonth":
      return { from: startOfMonthKey(today), to: today, label: "Este mês" };
    case "lastMonth": {
      const firstOfThis = startOfMonthKey(today);
      const lastMonthEnd = addDaysKey(firstOfThis, -1);
      return {
        from: startOfMonthKey(lastMonthEnd),
        to: lastMonthEnd,
        label: "Mês anterior",
      };
    }
    case "thisYear":
      return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "Este ano" };
    case "custom":
    default:
      return {
        from: customFrom || addDaysKey(today, -29),
        to: customTo || today,
        label: "Personalizado",
      };
  }
}

/** Período imediatamente anterior de mesma duração (para comparação). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const days = daysBetween(from, to) + 1;
  return { from: addDaysKey(from, -days), to: addDaysKey(from, -1) };
}
