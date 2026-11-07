import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { db } from "@/server/db/client";
import { bankAccounts } from "@/server/db/schema";
import { listBankAccounts, transferBetweenAccounts } from "@/server/services/finance";

export const GET = apiHandler({}, async () => ok({ items: await listBankAccounts() }));

export const POST = apiHandler(
  {
    permission: "settings.manage",
    body: z.object({
      name: z.string().trim().min(2).max(80),
      type: z.enum(["CASH", "BANK", "CARD"]),
      bankName: z.string().max(80).optional(),
      agency: z.string().max(20).optional(),
      accountNumber: z.string().max(30).optional(),
      initialBalance: z.union([z.string(), z.number()]).optional(),
    }),
  },
  async ({ body }) => {
    const [created] = await db
      .insert(bankAccounts)
      .values({
        name: body.name,
        type: body.type,
        bankName: body.bankName ?? null,
        agency: body.agency ?? null,
        accountNumber: body.accountNumber ?? null,
        initialBalance: String(body.initialBalance ?? 0),
        currentBalance: String(body.initialBalance ?? 0),
      })
      .returning();
    return ok({ item: created }, { status: 201 });
  },
);

export const PUT = apiHandler(
  {
    permission: "finance.pay",
    body: z.object({
      fromAccountId: z.string().uuid(),
      toAccountId: z.string().uuid(),
      amount: z.union([z.string(), z.number()]),
      date: z.string(),
      notes: z.string().max(300).optional(),
    }),
  },
  async ({ body, user }) => {
    const transfer = await transferBetweenAccounts({
      ...body,
      actor: { id: user.id, name: user.name },
    });
    return ok({ transfer });
  },
);
