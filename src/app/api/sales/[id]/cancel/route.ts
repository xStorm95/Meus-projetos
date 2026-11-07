import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { cancelSale } from "@/server/services/sales";
import { getSettingsCached } from "@/server/services/settings";
import { discountLimitFor } from "@/server/auth/permissions";

export const POST = apiHandler<{ reason: string }, unknown, { id: string }>(
  {
    permission: "sales.cancel",
    body: z.object({ reason: z.string().trim().min(5, "Informe a justificativa (mínimo 5 caracteres).").max(500) }),
  },
  async ({ params, body, user }) => {
    const settings = await getSettingsCached();
    const result = await cancelSale({
      saleId: params.id,
      reason: body.reason,
      actor: {
        id: user.id,
        name: user.name,
        maxDiscountPercent: discountLimitFor(user.role, settings),
        canUnlimitedDiscount: true,
        canNegativeStock: true,
      },
    });
    return ok({ sale: result.sale });
  },
);
