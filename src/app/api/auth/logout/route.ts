import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/server/auth/session";
import { writeAudit } from "@/server/lib/audit";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await writeAudit({
      userId: user.id,
      userName: user.name,
      action: "LOGOUT",
      entity: "auth",
      entityId: user.id,
      description: "Sessão encerrada",
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
