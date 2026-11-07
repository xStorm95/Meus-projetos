import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { apiHandler, ok } from "@/server/lib/api";
import { ValidationError, BusinessRuleError } from "@/server/lib/errors";
import { db } from "@/server/db/client";
import {
  brands,
  categories,
  colors as colorsTable,
  productVariants,
  products,
  sizes as sizesTable,
  suppliers,
} from "@/server/db/schema";
import { addVariants, createProduct, normalizeText } from "@/server/services/products";
import { money } from "@/server/lib/money";

/**
 * Importação de produtos por CSV.
 * Cabeçalho aceito (separador , ou ;):
 * nome, referencia, categoria, marca, fornecedor, cor, tamanho, custo, preco, estoque, codigo_barras
 * Uma linha por variação; linhas com a mesma referência agrupam a grade cor × tamanho.
 */
const rowSchema = z.object({
  nome: z.string().trim().min(2, "Nome do produto é obrigatório."),
  referencia: z.string().trim().optional(),
  categoria: z.string().trim().optional(),
  marca: z.string().trim().optional(),
  fornecedor: z.string().trim().optional(),
  cor: z.string().trim().optional(),
  tamanho: z.string().trim().optional(),
  custo: z.coerce.number().min(0).optional(),
  preco: z.coerce.number().min(0, "Preço inválido."),
  estoque: z.coerce.number().min(0).optional(),
  codigo_barras: z.string().trim().optional(),
});

function detectDelimiter(header: string): string {
  return header.includes(";") ? ";" : ",";
}

function parseCsv(text: string): Array<Record<string, string>> {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const delimiter = detectDelimiter(clean.split(/\r?\n/)[0] ?? "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = (lines[0] ?? "").split(delimiter).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

  return lines.slice(1).map((line) => {
    // Suporte a campos entre aspas simples com vírgula interna
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (char === delimiter && !quoted) {
        cells.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    cells.push(current);
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

export const POST = apiHandler(
  {
    permission: "products.import",
    body: z.object({
      csv: z.string().min(1, "Envie o conteúdo do arquivo CSV."),
      createMissing: z.boolean().optional(),
    }),
  },
  async ({ body, user }) => {
    const actor = { id: user.id, name: user.name };
    const raw = parseCsv(body.csv);
    if (!raw.length) throw new ValidationError("O arquivo está vazio ou sem linhas de dados.");
    if (raw.length > 2000) throw new ValidationError("Limite de 2.000 linhas por importação.");

    const [categoryRows, brandRows, colorRows, sizeRows, supplierRows] = await Promise.all([
      db.select().from(categories),
      db.select().from(brands),
      db.select().from(colorsTable),
      db.select().from(sizesTable),
      db.select().from(suppliers),
    ]);

    const findCategory = (name?: string) =>
      name ? categoryRows.find((c) => normalizeText(c.name) === normalizeText(name)) : undefined;
    const findBrand = (name?: string) =>
      name ? brandRows.find((b) => normalizeText(b.name) === normalizeText(name)) : undefined;
    const findColor = (name?: string) =>
      name ? colorRows.find((c) => normalizeText(c.name) === normalizeText(name)) : undefined;
    const findSize = (name?: string) =>
      name ? sizeRows.find((s) => normalizeText(s.name) === normalizeText(name)) : undefined;
    const findSupplier = (name?: string) =>
      name ? supplierRows.find((s) => normalizeText(s.legalName) === normalizeText(name) || normalizeText(s.tradeName ?? "") === normalizeText(name)) : undefined;

    // Agrupa linhas por referência/nome (cada linha = uma variação)
    const groups = new Map<string, { rows: z.infer<typeof rowSchema>[] }>();
    const errors: Array<{ line: number; message: string }> = [];

    raw.forEach((row, index) => {
      const parsed = rowSchema.safeParse({
        ...row,
        custo: row.custo?.replace(",", ".") || undefined,
        preco: (row.preco ?? "").replace(",", "."),
        estoque: row.estoque?.replace(",", ".") || undefined,
      });
      if (!parsed.success) {
        errors.push({ line: index + 2, message: parsed.error.issues[0]?.message ?? "Linha inválida." });
        return;
      }
      const key = normalizeText(parsed.data.referencia || parsed.data.nome);
      const group = groups.get(key) ?? { rows: [] };
      group.rows.push(parsed.data);
      groups.set(key, group);
    });

    let createdProducts = 0;
    let createdVariants = 0;
    let updatedVariants = 0;

    for (const { rows } of groups.values()) {
      const first = rows[0];
      const reference = (first.referencia || first.nome).trim();
      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.reference, reference.toUpperCase().replace(/\s+/g, "-").slice(0, 40)))
        .limit(1);

      // Nomes que não existem no catálogo são ignorados com aviso (não cria lixo)
      if (first.categoria && !findCategory(first.categoria)) {
        errors.push({ line: 1, message: `Categoria "${first.categoria}" não encontrada — produto importado sem categoria.` });
      }

      if (!existing[0]) {
        try {
          const created = await createProduct(
            {
              name: first.nome,
              reference,
              categoryId: findCategory(first.categoria)?.id ?? null,
              brandId: findBrand(first.marca)?.id ?? null,
              supplierId: findSupplier(first.fornecedor)?.id ?? null,
              costPrice: money(first.custo ?? 0),
              salePrice: money(first.preco),
              status: "ACTIVE",
            },
            actor,
          );
          const product = created.product;
          createdProducts += 1;

          // variações restantes (a primeira já foi criada junto com o produto)
          const extra = rows.filter((_, i) => i > 0 || first.cor || first.tamanho);
          if (extra.length) {
            const defs = rows.map((r) => ({
              colorId: findColor(r.cor)?.id ?? null,
              sizeId: findSize(r.tamanho)?.id ?? null,
              barcode: r.codigo_barras || null,
              costPrice: money(r.custo ?? first.custo ?? 0),
              salePrice: money(r.preco),
              stockQty: r.estoque ?? 0,
            }));
            // Mantém o vínculo com a primeira variação (criada no createProduct)
            const currentVariants = created.variants.map((v) => ({
              id: v.id,
              colorName: v.colorName,
              sizeName: v.sizeName,
            }));
            const pending = defs.filter(
              (d) =>
                !currentVariants.some(
                  (v) =>
                    normalizeText(v.colorName ?? "") === normalizeText(findColor(rows[defs.indexOf(d)]?.cor)?.name ?? "") &&
                    normalizeText(v.sizeName ?? "") === normalizeText(findSize(rows[defs.indexOf(d)]?.tamanho)?.name ?? ""),
                ),
            );
            if (pending.length) {
              const added = await addVariants(product.id, pending, actor);
              createdVariants += added.length;
            }
          }
        } catch (err) {
          errors.push({ line: 1, message: `${first.nome}: ${(err as Error).message}` });
        }
        continue;
      }

      // Produto existente: atualiza preço/custo e saldo informado
      const productId = existing[0].id;
      for (const r of rows) {
        const color = findColor(r.cor);
        const size = findSize(r.tamanho);
        const variantRows = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            sql`${productVariants.productId} = ${productId}
                AND (${color?.id ?? null}::uuid IS NULL OR ${productVariants.colorId} = ${color?.id ?? null})
                AND (${size?.id ?? null}::uuid IS NULL OR ${productVariants.sizeId} = ${size?.id ?? null})`,
          )
          .limit(1);
        if (variantRows[0]) {
          await db
            .update(productVariants)
            .set({
              salePrice: money(r.preco),
              ...(r.custo !== undefined ? { costPrice: money(r.custo) } : {}),
              updatedAt: new Date(),
            })
            .where(eq(productVariants.id, variantRows[0].id));
          updatedVariants += 1;
        } else if (color || size) {
          const added = await addVariants(
            productId,
            [
              {
                colorId: color?.id ?? null,
                sizeId: size?.id ?? null,
                barcode: r.codigo_barras || null,
                costPrice: money(r.custo ?? 0),
                salePrice: money(r.preco),
                stockQty: r.estoque ?? 0,
              },
            ],
            actor,
          );
          createdVariants += added.length;
        }
      }
    }

    if (groups.size === 0) throw new BusinessRuleError("Nenhuma linha válida encontrada no arquivo.");

    return ok({
      createdProducts,
      createdVariants,
      updatedVariants,
      groups: groups.size,
      errors,
    });
  },
);
