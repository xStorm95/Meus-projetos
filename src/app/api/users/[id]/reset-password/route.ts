import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { resetUserPassword } from "@/server/services/users";

const schema = z.object({ password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.") });

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "users.manage", body: schema },
  async ({ params, body, user }) =>
    ok(await resetUserPassword(params.id, body.password, { id: user.id, name: user.name })),
);
