import { apiHandler, ok } from "@/server/lib/api";
import { listActiveSessions } from "@/server/services/users";

export const GET = apiHandler({ permission: "users.view" }, async () => ok({ items: await listActiveSessions() }));
