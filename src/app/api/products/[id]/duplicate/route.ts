import { apiHandler, ok } from "@/server/lib/api";
import { duplicateProduct } from "@/server/services/products";

export const POST = apiHandler<unknown, unknown, { id: string }>(
  { permission: "products.create" },
  async ({ params, user }) => {
    const result = await duplicateProduct(params.id, { id: user.id, name: user.name });
    return ok({ product: result.product }, { status: 201 });
  },
);
