import { ok } from "@/lib/api";
import { getSession, listSessions } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return ok({ authenticated: false, account: null, sessions: [] });
  return ok({
    authenticated: true,
    account: session.account,
    session: session.session,
    sessions: await listSessions(session.account.id),
  });
}
