import { getSession, listSessions } from "@/lib/session";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <Dashboard
      account={session.account}
      sessions={await listSessions(session.account.id)}
      currentSessionExpiresAt={session.session.expiresAt}
    />
  );
}
