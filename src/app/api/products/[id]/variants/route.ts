import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { addVariants } from "@/server/services/products";

const schema = z.object({
  variants: z
    .array(
      z.object({
        colorId: z.string().uuid().nullable().optional(),
        sizeId: z.string().uuid().nullable().optional(),
        barcode: z.string().max(60).nullable().optional(),
        costPrice: z.union([z.string(), z.number()]).optional(),
        salePrice: z.union([z.string(), z.number()]).optional(),
        stockQty: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .min(1),
});

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "products.update", body: schema },
  async ({ params, body, user }) => {
    const created = await addVariants(params.id, body.variants, { id: user.id, name: user.name });
    return ok({ variants: created }, { status: 201 });
  },
);
