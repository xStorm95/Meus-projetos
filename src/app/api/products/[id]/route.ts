import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { deleteProduct, getProduct, updateProduct } from "@/server/services/products";

type Params = { id: string };

const updateSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
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
  csosn: z.string().max(6).nullable().optional(),
  unit: z.string().max(6).optional(),
  costPrice: z.union([z.string(), z.number()]).optional(),
  salePrice: z.union([z.string(), z.number()]).optional(),
  promoPrice: z.union([z.string(), z.number()]).nullable().optional(),
  promoStartsAt: z.string().nullable().optional(),
  promoEndsAt: z.string().nullable().optional(),
  maxDiscountPercent: z.union([z.string(), z.number()]).nullable().optional(),
  lowStock: z.number().int().min(0).optional(),
  images: z.array(z.string().max(500)).max(8).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  showOnline: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  variants: z
    .array(
      z.object({
        id: z.string().uuid(),
        barcode: z.string().max(60).nullable().optional(),
        costPrice: z.union([z.string(), z.number()]).optional(),
        salePrice: z.union([z.string(), z.number()]).optional(),
        promoPrice: z.union([z.string(), z.number()]).nullable().optional(),
        stockQty: z.union([z.string(), z.number()]).optional(),
        lowStock: z.number().int().min(0).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const GET = apiHandler<unknown, unknown, Params>(
  { permission: "products.view" },
  async ({ params }) => ok(await getProduct(params.id)),
);

export const PUT = apiHandler<z.infer<typeof updateSchema>, unknown, Params>(
  { permission: "products.update", body: updateSchema },
  async ({ params, body, user }) => {
    const updated = await updateProduct(params.id, body, { id: user.id, name: user.name });
    return ok({ product: updated });
  },
);

export const DELETE = apiHandler<unknown, unknown, Params>(
  { permission: "products.delete" },
  async ({ params, user }) => {
    const result = await deleteProduct(params.id, { id: user.id, name: user.name });
    return ok(result);
  },
);
