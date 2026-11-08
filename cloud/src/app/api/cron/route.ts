import { ok } from "@/lib/api";
import { ensureSchema } from "@/db/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Health check do banco (usado após o deploy). */
export async function GET() {
  try {
    const applied = await ensureSchema();
    return ok({ database: "ok", steps: applied.length });
  } catch (err) {
    return ok({ database: "erro", message: (err as Error).message });
  }
}
