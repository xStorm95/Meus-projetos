import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { setPurchaseStatus } from "@/server/services/purchases";

const schema = z.object({ reason: z.string().trim().min(3, "Informe o motivo do cancelamento.").max(300) });

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "purchases.manage", body: schema },
  async ({ params, user }) =>
    ok({ order: await setPurchaseStatus(params.id, "CANCELED", { id: user.id, name: user.name }) }),
);
