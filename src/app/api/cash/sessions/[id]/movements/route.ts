import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { addCashMovement, getSessionSummary } from "@/server/services/cash";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "cash.view" },
  async ({ params }) => ok(await getSessionSummary(params.id)),
);

export const POST = apiHandler<
  { type: "WITHDRAWAL" | "SUPPLY" | "RECEIPT" | "PAYMENT"; amount: string | number; description: string },
  unknown,
  { id: string }
>(
  {
    permission: "cash.withdraw",
    body: z.object({
      type: z.enum(["WITHDRAWAL", "SUPPLY", "RECEIPT", "PAYMENT"]),
      amount: z.union([z.string(), z.number()]),
      description: z.string().trim().min(3, "Informe a descrição/motivo.").max(300),
    }),
  },
  async ({ params, body, user }) => {
    const movement = await addCashMovement({
      sessionId: params.id,
      type: body.type,
      amount: body.amount,
      description: body.description,
      userId: user.id,
      userName: user.name,
    });
    return ok({ movement }, { status: 201 });
  },
);
