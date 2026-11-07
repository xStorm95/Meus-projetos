import { ok } from "@/lib/api";
import { endSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await endSession();
  return ok({ done: true });
}
