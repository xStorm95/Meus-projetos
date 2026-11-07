import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/server/auth/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user, catalog: PERMISSIONS, allPermissions: ALL_PERMISSIONS });
}
