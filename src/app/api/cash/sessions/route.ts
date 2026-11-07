import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { getOpenSession, getSessionSummary, listSessions, openSession } from "@/server/services/cash";

export const GET = apiHandler(
  {
    permission: "cash.view",
    query: z.object({
      current: z.enum(["true", "false"]).optional(),
      onlyOpen: z.enum(["true", "false"]).optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }),
  },
  async ({ query, user }) => {
    if (query.current === "true") {
      const session = await getOpenSession(user.id);
      if (!session) return ok({ session: null, summary: null });
      const summary = await getSessionSummary(session.id);
      return ok({ session, summary });
    }
    const items = await listSessions({
      onlyOpen: query.onlyOpen === "true",
      limit: query.limit ?? 50,
    });
    return ok({ items });
  },
);

export const POST = apiHandler(
  {
    permission: "cash.open",
    body: z.object({
      openingAmount: z.union([z.string(), z.number()]),
      notes: z.string().max(500).optional(),
    }),
  },
  async ({ body, user }) => {
    const session = await openSession({
      userId: user.id,
      userName: user.name,
      openingAmount: String(body.openingAmount),
      notes: body.notes,
    });
    return ok({ session }, { status: 201 });
  },
);
