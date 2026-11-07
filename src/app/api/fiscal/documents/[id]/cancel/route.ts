import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { cancelFiscalDocument } from "@/server/services/fiscal";

const schema = z.object({ reason: z.string().trim().min(3, "Informe o motivo.").max(300) });

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "fiscal.cancel", body: schema },
  async ({ params, body, user }) =>
    ok({ document: await cancelFiscalDocument(params.id, body.reason, { id: user.id, name: user.name }) }),
);
