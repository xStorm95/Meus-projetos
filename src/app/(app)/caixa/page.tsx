import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { cashSessions } from "@/server/db/schema";
import { getOpenSession, getSessionSummary, listSessions } from "@/server/services/cash";
import { CashView } from "./cash-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caixa" };

export default async function CashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("cash.view")) redirect("/");

  const currentSession = await getOpenSession(user.id);
  const summary = currentSession ? await getSessionSummary(currentSession.id) : null;

  const historyRows = await db
    .select()
    .from(cashSessions)
    .orderBy(asc(cashSessions.openedAt))
    .limit(60);

  const history = historyRows
    .slice()
    .reverse()
    .map((s) => ({
      id: s.id,
      code: s.code,
      openingAmount: s.openingAmount,
      openedAt: s.openedAt.toISOString(),
      status: s.status as "OPEN" | "CLOSED",
      salesTotal: s.salesTotal,
      countedAmount: s.countedAmount,
      expectedAmount: s.expectedAmount,
      difference: s.difference,
      closingNotes: s.closingNotes,
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      openingNotes: s.openingNotes,
    }));

  void listSessions;
  void eq;

  return (
    <CashView
      current={
        currentSession && summary
          ? {
              session: {
                id: currentSession.id,
                code: currentSession.code,
                openingAmount: currentSession.openingAmount,
                openedAt: currentSession.openedAt.toISOString(),
                status: "OPEN",
                salesTotal: currentSession.salesTotal,
                countedAmount: null,
                expectedAmount: null,
                difference: null,
                closingNotes: null,
                closedAt: null,
                openingNotes: currentSession.openingNotes,
              },
              summary,
            }
          : null
      }
      history={history}
      permissions={{
        canOpen: user.permissions.includes("cash.open"),
        canClose: user.permissions.includes("cash.close"),
        canWithdraw: user.permissions.includes("cash.withdraw"),
      }}
      operatorName={user.name}
    />
  );
}
