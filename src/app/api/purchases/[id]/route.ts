import { z } from "zod";
import { idOpcional } from "@/server/lib/product-schema";
import { apiHandler, ok } from "@/server/lib/api";
import { getPurchaseOrder, setPurchaseStatus, updatePurchaseOrder } from "@/server/services/purchases";

const itemSchema = z.object({
  variantId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(200),
  sku: z.string().max(60).nullable().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
});

const schema = z.object({
  supplierId: idOpcional(),
  issueDate: z.string().optional(),
  expectedDate: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1).optional(),
  discountAmount: z.number().min(0).optional(),
  freightAmount: z.number().min(0).optional(),
  installments: z.number().int().min(1).max(36).optional(),
  firstDueDate: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["DRAFT", "QUOTATION", "ORDERED"]).optional(),
});

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "purchases.view" },
  async ({ params }) => ok(await getPurchaseOrder(params.id)),
);

export const PATCH = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "purchases.manage", body: schema },
  async ({ params, body, user }) => {
    const actor = { id: user.id, name: user.name };
    const { status, ...patch } = body;
    let order = await getPurchaseOrder(params.id);
    if (Object.keys(patch).length > 0) {
      order = await updatePurchaseOrder(params.id, patch, actor) as unknown as typeof order;
    }
    if (status) {
      await setPurchaseStatus(params.id, status, actor);
    }
    return ok({ order: await getPurchaseOrder(params.id) });
  },
);
