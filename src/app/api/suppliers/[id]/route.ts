import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { getSupplier, updateSupplier } from "@/server/services/suppliers";

const schema = z.object({
  legalName: z.string().trim().min(3).max(180).optional(),
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

export const GET = apiHandler<unknown, unknown, { id: string }>(
  { permission: "suppliers.view" },
  async ({ params }) => ok(await getSupplier(params.id)),
);

export const PATCH = apiHandler<z.infer<typeof schema>, unknown, { id: string }>(
  { permission: "suppliers.manage", body: schema },
  async ({ params, body, user }) =>
    ok({ supplier: await updateSupplier(params.id, body, { id: user.id, name: user.name }) }),
);
