import { apiHandler, ok } from "@/server/lib/api";
import { getOpenSession } from "@/server/services/cash";

export const GET = apiHandler({}, async ({ user }) => {
  const session = await getOpenSession(user.id);
  return ok({
    open: Boolean(session),
    session: session
      ? {
          id: session.id,
          code: session.code,
          openingAmount: session.openingAmount,
          openedAt: session.openedAt.toISOString(),
        }
      : null,
  });
});
