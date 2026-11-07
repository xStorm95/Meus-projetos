import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { cancelQuote } from "@/server/services/quotes";

const schema = z.object({ reason: z.string().trim().min(3, "Informe o motivo.").max(300) });

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "quotes.manage", body: schema },
  async ({ params, body, user }) =>
    ok({ quote: await cancelQuote(params.id, body.reason, { id: user.id, name: user.name }) }),
);
