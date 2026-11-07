import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { createUser, listUsers, ROLE_OPTIONS } from "@/server/services/users";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/server/auth/permissions";

const createSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
  role: z.enum(["ADMIN", "MANAGER", "SELLER", "CASHIER", "FINANCE", "STOCK"]),
  phone: z.string().max(20).nullable().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  monthlyGoal: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  extraPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
  mustChangePassword: z.boolean().optional(),
});

export const GET = apiHandler(
  {
    permission: "users.view",
    query: z.object({ search: z.string().optional(), role: z.string().optional(), status: z.string().optional() }),
  },
  async ({ query }) =>
    ok({
      items: await listUsers(query),
      roles: ROLE_OPTIONS,
      permissionCatalog: ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key] })),
    }),
);

export const POST = apiHandler({ permission: "users.manage", body: createSchema }, async ({ body, user }) => {
  const created = await createUser(body, { id: user.id, name: user.name });
  return ok({ user: { id: created.id, name: created.name, email: created.email, role: created.role } }, { status: 201 });
});
