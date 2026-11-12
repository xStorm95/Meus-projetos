import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { getSettings, updateSettings } from "@/server/services/settings";
import { writeAudit } from "@/server/lib/audit";

const companySchema = z.object({
  appName: z.string().trim().min(2).max(40).optional(),
  companyName: z.string().trim().min(2, "Informe o nome da loja.").max(120).optional(),
  companyLegalName: z.string().max(160).nullable().optional(),
  companyDocument: z.string().max(20).nullable().optional(),
  companyStateRegistration: z.string().max(30).nullable().optional(),
  companyCityRegistration: z.string().max(30).nullable().optional(),
  companyAddress: z.string().max(200).nullable().optional(),
  companyAddressNumber: z.string().max(20).nullable().optional(),
  companyDistrict: z.string().max(80).nullable().optional(),
  companyCity: z.string().max(80).nullable().optional(),
  companyState: z.string().max(2).nullable().optional(),
  companyZip: z.string().max(10).nullable().optional(),
  companyPhone: z.string().max(20).nullable().optional(),
  companyEmail: z.union([z.string().email("E-mail inválido."), z.literal("")]).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  printFooter: z.string().max(300).nullable().optional(),
  lgpdPrivacyContact: z.string().max(160).nullable().optional(),
  lgpdRetentionMonths: z.number().int().min(12).max(240).optional(),
});

const rulesSchema = z.object({
  allowNegativeStock: z.boolean().optional(),
  lowStockDefault: z.number().int().min(0).max(9999).optional(),
  defaultMaxDiscount: z.number().min(0).max(100).optional(),
  sellerMaxDiscount: z.number().min(0).max(100).optional(),
  requireDiscountReason: z.boolean().optional(),
  creditDefaultLimit: z.number().min(0).optional(),
  creditInterestRate: z.number().min(0).max(100).optional(),
  creditPenaltyRate: z.number().min(0).max(100).optional(),
  creditDailyInterest: z.number().min(0).max(10).optional(),
  creditGraceDays: z.number().int().min(0).max(90).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  accentColor: z.string().max(20).optional(),
  whatsappEnabled: z.boolean().optional(),
});

const paymentsSchema = z.object({
  /** Chave Pix: CPF/CNPJ (só dígitos), e-mail, telefone +55... ou aleatória. */
  pixKey: z.string().trim().max(77, "Chave Pix muito longa.").nullable().optional(),
  /** Nome que aparece no app do banco (máx. 25, normalizado no BR Code). */
  pixReceiverName: z.string().trim().max(60).nullable().optional(),
  pixCity: z.string().trim().max(60).nullable().optional(),
});

const labelsSchema = z.object({
  labelSize: z.enum(["60x40", "50x30", "100x50", "40x25"]).optional(),
  labelShowPrice: z.boolean().optional(),
  labelShowBarcode: z.boolean().optional(),
  labelExtraText: z.string().trim().max(80).nullable().optional(),
  offlineSalesEnabled: z.boolean().optional(),
});

const fiscalSchema = z.object({
  fiscalProvider: z.string().max(60).nullable().optional(),
  fiscalEnvironment: z.enum(["HOMOLOGATION", "PRODUCTION"]).optional(),
  fiscalSeriesNfce: z.number().int().min(1).max(999).optional(),
  fiscalNextNumberNfce: z.number().int().min(1).optional(),
  fiscalSeriesNfe: z.number().int().min(1).max(999).optional(),
  fiscalNextNumberNfe: z.number().int().min(1).optional(),
  fiscalCscId: z.string().max(60).nullable().optional(),
  fiscalCscToken: z.string().max(200).nullable().optional(),
  fiscalCertificateName: z.string().max(120).nullable().optional(),
  fiscalDefaultCfop: z.string().max(4).optional(),
  fiscalDefaultNcm: z.string().max(8).nullable().optional(),
  fiscalDefaultCsosn: z.string().max(4).optional(),
});

const bodySchema = z.object({
  section: z.enum(["company", "rules", "fiscal", "payments", "labels"]),
  company: companySchema.optional(),
  rules: rulesSchema.optional(),
  fiscal: fiscalSchema.optional(),
  payments: paymentsSchema.optional(),
  labels: labelsSchema.optional(),
});

export const GET = apiHandler({ permission: "settings.view" }, async () => {
  const current = await getSettings();
  // Nunca devolve o token CSC em claro (apenas indicador de configuração)
  return ok({ settings: { ...current, fiscalCscToken: current.fiscalCscToken ? "••••••" : null } });
});

export const PATCH = apiHandler({ permission: "settings.manage", body: bodySchema }, async ({ body, user }) => {
  const before = await getSettings();
  const patch: Record<string, unknown> = {};

  if (body.section === "company" && body.company) {
    for (const [key, value] of Object.entries(body.company)) {
      if (value === undefined) continue;
      patch[key] = typeof value === "string" ? value || null : value;
    }
  }
  if (body.section === "rules" && body.rules) {
    for (const [key, value] of Object.entries(body.rules)) {
      if (value === undefined) continue;
      patch[key] =
        typeof value === "number" && ["defaultMaxDiscount", "sellerMaxDiscount", "creditDefaultLimit", "creditInterestRate", "creditPenaltyRate", "creditDailyInterest"].includes(key)
          ? String(value)
          : value;
    }
  }
  if (body.section === "payments" && body.payments) {
    for (const [key, value] of Object.entries(body.payments)) {
      if (value === undefined) continue;
      // Chave Pix de CPF/CNPJ e telefone ficam só com dígitos/+; e-mail e
      // chave aleatória são preservados como texto.
      if (key === "pixKey" && typeof value === "string") {
        const limpa = value.trim();
        const soDigitos = /^[\d.\-/\s]+$/.test(limpa) ? limpa.replace(/\D/g, "") : limpa;
        patch[key] = soDigitos || null;
        continue;
      }
      patch[key] = typeof value === "string" ? value || null : value;
    }
  }
  if (body.section === "labels" && body.labels) {
    for (const [key, value] of Object.entries(body.labels)) {
      if (value === undefined) continue;
      patch[key] = typeof value === "string" ? value || null : value;
    }
  }
  if (body.section === "fiscal" && body.fiscal) {
    for (const [key, value] of Object.entries(body.fiscal)) {
      if (value === undefined) continue;
      if (key === "fiscalCscToken" && (value === "••••••" || value === "")) continue;
      patch[key] = typeof value === "string" ? value || null : value;
    }
  }

  if (Object.keys(patch).length === 0) return ok({ settings: before });

  const updated = await updateSettings(patch as never);
  await writeAudit({
    userId: user.id,
    userName: user.name,
    action: "SETTINGS_UPDATE",
    entity: "settings",
    entityId: "default",
    description: `Configurações atualizadas (${body.section}).`,
    before: body.section === "rules" ? { allowNegativeStock: before.allowNegativeStock, sellerMaxDiscount: before.sellerMaxDiscount } : undefined,
    after: patch,
  });
  return ok({ settings: { ...updated, fiscalCscToken: updated.fiscalCscToken ? "••••••" : null } });
});
