import { ok } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return ok({
    app: "palco",
    mode: "cloud",
    openSignup: true,
    authenticated: Boolean(session),
    firstName: session ? session.account.name.split(" ")[0] : null,
  });
}
