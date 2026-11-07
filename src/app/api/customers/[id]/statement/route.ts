import { apiHandler, ok } from "@/server/lib/api";
import { customerBalanceStatement } from "@/server/services/finance";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: ["credit.view", "finance.view"] },
  async ({ params }) => ok(await customerBalanceStatement(params.id)),
);
