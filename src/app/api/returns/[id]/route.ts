import { apiHandler, ok } from "@/server/lib/api";
import { getReturnDetail } from "@/server/services/returns";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "returns.view" },
  async ({ params }) => ok(await getReturnDetail(params.id)),
);
