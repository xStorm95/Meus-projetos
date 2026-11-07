import { apiHandler, ok } from "@/server/lib/api";
import { receivableCharges } from "@/server/services/finance";

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: ["finance.view", "credit.view"] },
  async ({ params }) => ok(await receivableCharges(params.id)),
);
