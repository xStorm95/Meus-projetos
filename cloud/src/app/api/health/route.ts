import { ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Identifica o app para o cliente decidir entre modo nuvem e offline. */
export async function GET() {
  return ok({ app: "palco", version: 2, cloud: true, storage: "postgresql" });
}
