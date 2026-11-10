import { z } from "zod";
import { apiHandler, ok, audit } from "@/server/lib/api";
import { createProduct, listProducts } from "@/server/services/products";
import { productSchema } from "@/server/lib/product-schema";
export const GET = apiHandler(
  {
    permission: "products.view",
    query: z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      brandId: z.string().uuid().optional(),
      status: z.string().optional(),
      stockFilter: z.enum(["all", "low", "out", "available"]).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
      sort: z.enum(["name", "stock", "price", "recent"]).optional(),
    }),
  },
  async ({ query }) => {
    const data = await listProducts(query);
    return ok(data);
  },
);

export const POST = apiHandler(
  { permission: "products.create", body: productSchema },
  async ({ body, user, ip }) => {
    const result = await createProduct(body, { id: user.id, name: user.name });
    await audit(user, {
      action: "PRODUCT_CREATE_API",
      entity: "product",
      entityId: result.product.id,
      description: `Produto ${result.product.reference} criado via API`,
    }, ip);
    return ok({ product: result.product, variants: result.variants }, { status: 201 });
  },
);
