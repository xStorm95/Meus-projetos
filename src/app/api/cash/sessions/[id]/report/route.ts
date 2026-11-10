/**
 * Relatório de caixa (fechamento / resumo em aberto) para impressão.
 *
 * O botão "Imprimir relatório" no Caixa apontava para esta rota, que não
 * existia (404). Reutiliza `getSessionSummary` — a MESMA função que a tela usa
 * — para que os valores do papel batam exatamente com os valores da tela.
 */
import { eq } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { cashSessions, settings, users } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { getSessionSummary } from "@/server/services/cash";
import { isUuid } from "@/server/lib/uuid";
import { cashReportHtml, htmlResponse } from "@/server/lib/comprovante";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "cash.view" },
  async ({ params }) => {
    // id malformado (ex.: "undefined" por um link quebrado) não pode virar 500
    if (!isUuid(params.id)) throw new NotFoundError("Caixa");
    const rows = await db
      .select({ session: cashSessions, operatorName: users.name })
      .from(cashSessions)
      .leftJoin(users, eq(users.id, cashSessions.userId))
      .where(eq(cashSessions.id, params.id))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Caixa");

    const [summary, store] = await Promise.all([
      getSessionSummary(params.id),
      db.select().from(settings).limit(1),
    ]);

    const s = rows[0].session;

    return htmlResponse(
      cashReportHtml({
        storeName: store[0]?.companyName ?? "Minha Loja",
        operatorName: rows[0].operatorName,
        session: {
          id: s.id,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          openingAmount: s.openingAmount,
          countedAmount: s.countedAmount,
          expectedAmount: s.expectedAmount ?? summary.expectedCash,
          difference: s.difference,
          status: s.status,
          notes: s.closingNotes ?? s.openingNotes ?? null,
        },
        summary: {
          salesCount: summary.movements.filter((m) => m.type === "SALE").length,
          salesTotal: summary.salesTotal,
          cashIn: summary.supplies,
          cashOut: summary.withdrawals,
          byPayment: summary.byMethod.map((m) => ({
            method: m.method,
            total: m.total,
            count: summary.movements.filter((mv) => mv.method === m.method).length,
          })),
        },
        movements: summary.movements
          .filter((m) => m.type !== "OPENING")
          .map((m) => ({
            kind: Number(m.amount) >= 0 ? "IN" : "OUT",
            amount: String(Math.abs(Number(m.amount))),
            reason: `${m.description ?? m.type}${m.userName ? ` · ${m.userName}` : ""}`,
            at: m.createdAt,
          })),
      }),
    );
  },
);
