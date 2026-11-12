/**
 * FUSO E PERÍODO — o bug que fazia o dashboard se contradizer.
 *
 * Sintoma relatado: com o filtro "Este mês", o card "Faturamento do período"
 * mostrava R$ 600,00 / 1 venda e o card "Faturamento do mês" mostrava
 * R$ 0,00 / 0 vendas; o gráfico e "Formas de pagamento" diziam que não havia
 * vendas.
 *
 * Causa: `todayKey()` montava a data em UTC. De noite (Brasília = UTC-3) o
 * processo em UTC já estava no dia seguinte, então "hoje"/"este mês"
 * apontavam para datas diferentes das usadas pelo filtro do período. Além
 * disso, a janela de datas (`T00:00:00Z`) tratava 00:00 UTC como início do
 * dia, jogando vendas da noite para o dia/mês seguinte.
 */
import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  inicioDoDia,
  rangeToTimestamps,
  resolvePeriod,
  startOfMonthKey,
  todayKey,
} from "../src/server/lib/dates";

/**
 * Instante em UTC que corresponde a um horário de Brasília (UTC-3).
 * Usa aritmética de tempo em vez de montar a string, para 22:00 virar
 * 01:00 do dia seguinte corretamente.
 */
function brasilia(iso: string, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + (h + 3) * 3600_000 + m * 60_000);
}

describe("todayKey: o dia é o da loja, não o do servidor (UTC)", () => {
  it("23h de Brasília ainda é o dia de hoje", () => {
    // 07/11 23:30 em Brasília = 08/11 02:30 UTC
    expect(todayKey(brasilia("2026-11-07", "23:30"))).toBe("2026-11-07");
  });

  it("00h10 de Brasília já é o dia novo", () => {
    // 08/11 00:10 em Brasília = 08/11 03:10 UTC
    expect(todayKey(brasilia("2026-11-08", "00:10"))).toBe("2026-11-08");
  });

  it("03h de Brasília (06h UTC) não pula para o dia seguinte", () => {
    expect(todayKey(brasilia("2026-11-07", "03:00"))).toBe("2026-11-07");
  });

  it("virada de mês: 23h de 31/01 continua sendo 31/01", () => {
    expect(todayKey(brasilia("2026-01-31", "23:00"))).toBe("2026-01-31");
    expect(startOfMonthKey(todayKey(brasilia("2026-01-31", "23:00")))).toBe("2026-01-01");
  });
});

describe("janela de datas: início inclusivo, fim exclusivo, no fuso da loja", () => {
  it("o dia começa às 03:00 UTC (00:00 em Brasília)", () => {
    expect(inicioDoDia("2026-11-07").toISOString()).toBe("2026-11-07T03:00:00.000Z");
  });

  it("um dia só cobre exatamente 24 horas", () => {
    const { gte, lt } = rangeToTimestamps("2026-11-07", "2026-11-07");
    expect(lt.getTime() - gte.getTime()).toBe(24 * 3600_000);
  });

  it("venda às 22h de 31/01 entra no período de janeiro", () => {
    const { gte, lt } = rangeToTimestamps("2026-01-01", "2026-01-31");
    const venda = brasilia("2026-01-31", "22:00");
    expect(venda.getTime()).toBeGreaterThanOrEqual(gte.getTime());
    expect(venda.getTime()).toBeLessThan(lt.getTime());
  });

  it("venda às 00h30 de 01/02 NÃO entra no período de janeiro", () => {
    const { gte, lt } = rangeToTimestamps("2026-01-01", "2026-01-31");
    const venda = brasilia("2026-02-01", "00:30");
    expect(venda.getTime()).toBeGreaterThanOrEqual(lt.getTime());
    void gte;
  });

  it("venda às 23h do último dia do mês entra no mês", () => {
    const { gte, lt } = rangeToTimestamps("2026-02-01", "2026-02-28");
    const venda = brasilia("2026-02-28", "23:50");
    expect(venda.getTime()).toBeLessThan(lt.getTime());
    expect(venda.getTime()).toBeGreaterThanOrEqual(gte.getTime());
  });
});

describe("presets usam a mesma regra do card do mês", () => {
  it("'Este mês' começa no dia 1 do mês da loja", () => {
    const p = resolvePeriod("thisMonth");
    expect(p.from).toBe(startOfMonthKey(todayKey()));
    expect(p.to).toBe(todayKey());
    // A janela do card do período e a do card do mês partem do MESMO `from`
    expect(p.from).toBe(`${todayKey().slice(0, 7)}-01`);
  });

  it("'Mês anterior' termina no último dia do mês anterior", () => {
    const p = resolvePeriod("lastMonth");
    expect(p.to).toBe(addDaysKey(startOfMonthKey(todayKey()), -1));
    expect(p.from <= p.to).toBe(true);
  });
});
