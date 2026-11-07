import { apiHandler, ok } from "@/server/lib/api";
import { markNotificationRead } from "@/server/services/notifications";

export const POST = apiHandler<unknown, unknown, { id: string }>({}, async ({ params }) => {
  await markNotificationRead(params.id);
  return ok({ ok: true });
});
