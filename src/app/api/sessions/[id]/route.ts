import { apiHandler, ok } from "@/server/lib/api";
import { revokeSession } from "@/server/services/users";

export const DELETE = apiHandler<unknown, unknown, { id: string }>(
  { permission: "users.manage" },
  async ({ params, user }) => ok(await revokeSession(params.id, { id: user.id, name: user.name })),
);
