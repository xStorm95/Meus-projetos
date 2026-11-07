import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import {
  fiscalReadiness,
  fiscalStats,
  listFiscalDocuments,
  salesWithoutFiscalDocument,
} from "@/server/services/fiscal";

export const GET = apiHandler(
  {
    permission: "fiscal.view",
    query: z.object({
      status: z.string().optional(),
      model: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      includePending: z.enum(["true", "false"]).optional(),
    }),
  },
  async ({ query }) => {
    const [documents, readiness, stats, pendingSales] = await Promise.all([
      listFiscalDocuments({ ...query, pageSize: 30 }),
      fiscalReadiness(),
      fiscalStats(),
      salesWithoutFiscalDocument(40),
    ]);
    return ok({ documents, readiness, stats, pendingSales });
  },
);

export const POST = apiHandler(
  {
    permission: "fiscal.emit",
    body: z.object({
      saleId: z.string().uuid(),
      model: z.enum(["65", "55"]).optional(),
      force: z.boolean().optional(),
    }),
  },
  async ({ body, user }) => {
    const { prepareFiscalDocument } = await import("@/server/services/fiscal");
    const doc = await prepareFiscalDocument(body, { id: user.id, name: user.name });
    return ok({ document: doc }, { status: 201 });
  },
);
