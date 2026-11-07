import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { createCustomer, listCustomers } from "@/server/services/customers";

const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(160),
  document: z.string().max(20).nullable().optional(),
  personType: z.enum(["PF", "PJ"]).optional(),
  birthDate: z.string().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  whatsapp: z.string().max(20).nullable().optional(),
  email: z.union([z.string().email("E-mail inválido."), z.literal("")]).nullable().optional(),
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
  lgpdConsent: z.boolean().optional(),
  lgpdConsentSource: z.string().max(60).nullable().optional(),
});

export const GET = apiHandler(
  {
    permission: "customers.view",
    query: z.object({
      search: z.string().optional(),
      classification: z.string().optional(),
      birthdaysMonth: z.coerce.number().int().min(1).max(12).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  async ({ query }) => ok(await listCustomers(query)),
);

export const POST = apiHandler(
  { permission: "customers.create", body: customerSchema },
  async ({ body, user }) => {
    const customer = await createCustomer(body, { id: user.id, name: user.name });
    return ok({ customer }, { status: 201 });
  },
);
