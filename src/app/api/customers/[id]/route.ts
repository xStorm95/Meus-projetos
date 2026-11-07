import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { anonymizeCustomer, getCustomerDetail, updateCustomer } from "@/server/services/customers";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  document: z.string().max(20).nullable().optional(),
  birthDate: z.string().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  whatsapp: z.string().max(20).nullable().optional(),
  email: z.union([z.string().email(), z.literal("")]).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  addressNumber: z.string().max(20).nullable().optional(),
  district: z.string().max(80).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  zip: z.string().max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sizePreference: z.string().max(20).nullable().optional(),
  creditLimit: z.union([z.string(), z.number()]).optional(),
  isActive: z.boolean().optional(),
  acceptsWhatsapp: z.boolean().optional(),
  acceptsEmail: z.boolean().optional(),
});

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "customers.view" },
  async ({ params }) => ok(await getCustomerDetail(params.id)),
);

export const PUT = apiHandler<z.infer<typeof updateSchema>, unknown, { id: string }>(
  { permission: "customers.update", body: updateSchema },
  async ({ params, body, user }) => {
    const customer = await updateCustomer(params.id, body, { id: user.id, name: user.name });
    return ok({ customer });
  },
);

export const DELETE = apiHandler<{ reason?: string }, unknown, { id: string }>(
  { permission: "customers.delete" },
  async ({ params, user }) => {
    const customer = await anonymizeCustomer(params.id, { id: user.id, name: user.name });
    return ok({
      customer,
      message: "Dados pessoais removidos. O histórico de vendas foi preservado sem dados pessoais.",
    });
  },
);
