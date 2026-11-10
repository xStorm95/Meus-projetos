/**
 * Esquemas de validação do produto.
 *
 * Ficam fora da rota porque o Next não aceita exportações extras em
 * `route.ts`, e os testes precisam validar exatamente o que a API valida.
 */
import { z } from "zod";


export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  colorId: z.string().uuid().nullable().optional(),
  sizeId: z.string().uuid().nullable().optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  costPrice: z.union([z.string(), z.number()]).optional(),
  salePrice: z.union([z.string(), z.number()]).optional(),
  promoPrice: z.union([z.string(), z.number()]).nullable().optional(),
  stockQty: z.union([z.string(), z.number()]).optional(),
  lowStock: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Um <select> sem escolha manda "" — e "" não é uuid. Aceitar "" como null
 * evita "Invalid uuid" em qualquer formulário (produto, edição, integrações).
 */
export const uuidOpcional = () =>
  z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null));

/**
 * Data opcional vinda de <input type="date">. Vazio ("") significa "sem data",
 * mas a coluna é `date` e o Postgres recusaria "" com 22007 — por isso vira null.
 */
export const dataOpcional = () =>
  z.preprocess((valor) => (valor === "" ? null : valor), z.string().nullable().optional());

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto.").max(180),
  reference: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  categoryId: uuidOpcional(),
  subcategoryId: uuidOpcional(),
  brandId: uuidOpcional(),
  supplierId: uuidOpcional(),
  collectionId: uuidOpcional(),
  material: z.string().max(120).nullable().optional(),
  composition: z.string().max(240).nullable().optional(),
  origin: z.string().max(2).optional(),
  ncm: z.string().max(10).nullable().optional(),
  cest: z.string().max(12).nullable().optional(),
  cfop: z.string().max(6).nullable().optional(),
  cstIcms: z.string().max(6).nullable().optional(),
  csosn: z.string().max(6).nullable().optional(),
  unit: z.string().max(6).optional(),
  costPrice: z.union([z.string(), z.number()]),
  salePrice: z.union([z.string(), z.number()]),
  promoPrice: z.union([z.string(), z.number()]).nullable().optional(),
  /** Colunas `date`: "" faria o Postgres recusar com 22007 (erro 500). */
  promoStartsAt: dataOpcional(),
  promoEndsAt: dataOpcional(),
  maxDiscountPercent: z.union([z.string(), z.number()]).nullable().optional(),
  lowStock: z.number().int().min(0).optional(),
  images: z.array(z.string().max(500)).max(8).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  showOnline: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  variants: z.array(variantSchema).max(400).optional(),
  grid: z
    .object({ colorIds: z.array(z.string().uuid()), sizeIds: z.array(z.string().uuid()) })
    .optional(),
  kitItems: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().positive() }))
    .max(50)
    .optional(),
});
