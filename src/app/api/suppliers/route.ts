import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { createSupplier, listSuppliers } from "@/server/services/suppliers";

const supplierSchema = z.object({
  legalName: z.string().trim().min(3, "Informe a razão social.").max(180),
  tradeName: z.string().max(180).nullable().optional(),
  document: z.string().max(20).nullable().optional(),
  stateRegistration: z.string().max(30).nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.union([z.string().email("E-mail inválido."), z.literal("")]).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  addressNumber: z.string().max(20).nullable().optional(),
  district: z.string().max(80).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  zip: z.string().max(10).nullable().optional(),
  paymentTerms: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = apiHandler(
  {
    permission: "suppliers.view",
    query: z.object({
      search: z.string().optional(),
      status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(200).optional(),
    }),
  },
  async ({ query }) => ok(await listSuppliers(query)),
);

export const POST = apiHandler({ permission: "suppliers.manage", body: supplierSchema }, async ({ body, user }) => {
  const supplier = await createSupplier(body, { id: user.id, name: user.name });
  return ok({ supplier }, { status: 201 });
});
