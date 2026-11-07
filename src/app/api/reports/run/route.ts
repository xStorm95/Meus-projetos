import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { runReport, REPORT_CATALOG } from "@/server/services/reports";
import { ForbiddenError } from "@/server/lib/errors";

const schema = z.object({
  kind: z.string(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(2000).optional(),
});

export const GET = apiHandler({ query: schema }, async ({ query, user }) => {
  const report = REPORT_CATALOG.find((r) => r.kind === query.kind);
  if (!report) throw new ForbiddenError("Relatório não disponível.");
  if (!user.permissions.includes(report.permission) && !user.permissions.includes("reports.view")) {
    throw new ForbiddenError("Você não tem permissão para este relatório.");
  }
  const data = await runReport({
    kind: query.kind as never,
    from: query.from,
    to: query.to,
    limit: query.limit,
  });
  return ok(data);
});
