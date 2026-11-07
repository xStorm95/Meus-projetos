import { apiHandler, ok } from "@/server/lib/api";
import { saleForReturn } from "@/server/services/returns";

export const GET = apiHandler<unknown, unknown, { reference: string }>(
  { permission: "returns.create" },
  async ({ params }) => ok(await saleForReturn(params.reference)),
);
