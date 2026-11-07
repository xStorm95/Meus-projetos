import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { recentAudit } from "@/server/services/users";

export const GET = apiHandler(
  { permission: "audit.view", query: z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }) },
  async ({ query }) => ok({ items: await recentAudit(query.limit ?? 200) }),
);
