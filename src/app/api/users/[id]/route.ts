import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { updateUser } from "@/server/services/users";

const schema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "MANAGER", "SELLER", "CASHIER", "FINANCE", "STOCK"]).optional(),
  phone: z.string().max(20).nullable().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  monthlyGoal: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  extraPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
});

export const PATCH = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "users.manage", body: schema },
  async ({ params, body, user }) => ok({ user: await updateUser(params.id, body, { id: user.id, name: user.name }) }),
);
