import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { toggleUserActive } from "@/server/services/users";

const schema = z.object({ isActive: z.boolean() });

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "users.manage", body: schema },
  async ({ params, body, user }) =>
    ok(await toggleUserActive(params.id, body.isActive, { id: user.id, name: user.name })),
);
