import { apiHandler, ok } from "@/server/lib/api";
import { markAllRead } from "@/server/services/notifications";

export const POST = apiHandler({}, async () => {
  await markAllRead();
  return ok({ ok: true });
});
