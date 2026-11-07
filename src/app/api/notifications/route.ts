import { apiHandler, ok } from "@/server/lib/api";
import {
  listNotifications,
  markAllRead,
  refreshAlerts,
  unreadCount,
} from "@/server/services/notifications";

export const GET = apiHandler({}, async () => {
  await refreshAlerts().catch(() => undefined);
  const [items, unread] = await Promise.all([listNotifications({ limit: 40 }), unreadCount()]);
  return ok({
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      severity: n.severity,
      title: n.title,
      message: n.message,
      entity: n.entity,
      entityId: n.entityId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  });
});

export const POST = apiHandler({}, async () => {
  await markAllRead();
  return ok({ ok: true });
});
