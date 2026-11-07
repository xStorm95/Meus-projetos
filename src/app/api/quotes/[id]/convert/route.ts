import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { convertQuoteToSale } from "@/server/services/quotes";
import { discountLimitFor } from "@/server/auth/permissions";
import { getSettingsCached } from "@/server/services/settings";

const paymentSchema = z.object({
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "TRANSFER", "OTHER"]),
  amount: z.union([z.string(), z.number()]),
  installments: z.number().int().min(1).max(36).optional(),
  tenderedAmount: z.union([z.string(), z.number()]).optional(),
  firstDueDate: z.string().optional(),
});

const schema = z.object({
  payments: z.array(paymentSchema).min(1, "Informe a forma de pagamento."),
  discountAmount: z.number().min(0).optional(),
  surchargeAmount: z.number().min(0).optional(),
  discountReason: z.string().max(300).optional(),
});

export const POST = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "sales.create", body: schema },
  async ({ params, body, user }) => {
    const settings = await getSettingsCached();
    const result = await convertQuoteToSale({
      quoteId: params.id,
      payments: body.payments,
      discountAmount: body.discountAmount,
      surchargeAmount: body.surchargeAmount,
      discountReason: body.discountReason,
      actor: {
        id: user.id,
        name: user.name,
        maxDiscountPercent: discountLimitFor(user.role as never, settings),
        canUnlimitedDiscount: user.permissions.includes("sales.discount.unlimited") || user.role === "ADMIN",
        canNegativeStock: user.permissions.includes("stock.negative.allow") || settings.allowNegativeStock,
      },
    });
    return ok({ sale: result.sale, change: result.change });
  },
);
