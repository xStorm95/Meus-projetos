import { z } from "zod";
import { idOpcional } from "@/server/lib/product-schema";
import { apiHandler, ok } from "@/server/lib/api";
import { createPurchaseOrder, listPurchaseOrders } from "@/server/services/purchases";

const itemSchema = z.object({
  variantId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "Descreva o item.").max(200),
  sku: z.string().max(60).nullable().optional(),
  quantity: z.number().positive("Quantidade deve ser maior que zero."),
  unitCost: z.number().min(0, "Custo inválido."),
});

const orderSchema = z.object({
  supplierId: z.string().uuid("Selecione o fornecedor."),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  expectedDate: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1, "Adicione ao menos um item."),
  discountAmount: z.number().min(0).optional(),
  freightAmount: z.number().min(0).optional(),
  installments: z.number().int().min(1).max(36).optional(),
  firstDueDate: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const GET = apiHandler(
  {
    permission: "purchases.view",
    query: z.object({
      supplierId: z.string().uuid().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  async ({ query }) => ok(await listPurchaseOrders(query)),
);

export const POST = apiHandler({ permission: "purchases.manage", body: orderSchema }, async ({ body, user }) => {
  const order = await createPurchaseOrder(body, { id: user.id, name: user.name });
  return ok({ order }, { status: 201 });
});
