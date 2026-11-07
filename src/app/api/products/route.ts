import { z } from "zod";
import { apiHandler, ok, audit } from "@/server/lib/api";
import { createProduct, listProducts } from "@/server/services/products";

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  colorId: z.string().uuid().nullable().optional(),
  sizeId: z.string().uuid().nullable().optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  costPrice: z.union([z.string(), z.number()]).optional(),
  salePrice: z.union([z.string(), z.number()]).optional(),
  promoPrice: z.union([z.string(), z.number()]).nullable().optional(),
  stockQty: z.union([z.string(), z.number()]).optional(),
  lowStock: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto.").max(180),
  reference: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  subcategoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  collectionId: z.string().uuid().nullable().optional(),
  material: z.string().max(120).nullable().optional(),
  composition: z.string().max(240).nullable().optional(),
  origin: z.string().max(2).optional(),
  ncm: z.string().max(10).nullable().optional(),
  cest: z.string().max(12).nullable().optional(),
  cfop: z.string().max(6).nullable().optional(),
  cstIcms: z.string().max(6).nullable().optional(),
  csosn: z.string().max(6).nullable().optional(),
  unit: z.string().max(6).optional(),
  costPrice: z.union([z.string(), z.number()]),
  salePrice: z.union([z.string(), z.number()]),
  promoPrice: z.union([z.string(), z.number()]).nullable().optional(),
  promoStartsAt: z.string().nullable().optional(),
  promoEndsAt: z.string().nullable().optional(),
  maxDiscountPercent: z.union([z.string(), z.number()]).nullable().optional(),
  lowStock: z.number().int().min(0).optional(),
  images: z.array(z.string().max(500)).max(8).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  showOnline: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  variants: z.array(variantSchema).max(400).optional(),
  grid: z
    .object({ colorIds: z.array(z.string().uuid()), sizeIds: z.array(z.string().uuid()) })
    .optional(),
  kitItems: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().positive() }))
    .max(50)
    .optional(),
});

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
