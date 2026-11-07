import { z } from "zod";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvDateTime, jsonResponse } from "@/server/lib/export";
import { queryAudit } from "@/server/services/audit-query";

const schema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  from: z.string().optional(),
  to: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  search: z.string().optional(),
});

export const GET = apiHandler({ permission: "audit.view", query: schema }, async ({ query }) => {
  const data = await queryAudit({
    ...query,
    action: query.action === "ALL" ? undefined : query.action,
    entity: query.entity === "ALL" ? undefined : query.entity,
    pageSize: 200,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  if (query.format === "json") return jsonResponse(`auditoria_${stamp}.json`, data.items);
  return csvResponse(
    `auditoria_${stamp}.csv`,
    ["Data/hora", "Usuário", "Ação", "Entidade", "Identificador", "Descrição", "IP"],
    data.items.map((r) => [
      csvDateTime(r.createdAt),
      r.userName ?? "sistema",
      r.action,
      r.entity,
      r.entityId,
      r.description,
      r.ip,
    ]),
  );
});
