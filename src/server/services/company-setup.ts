/**
 * PROVISIONAMENTO DE UMA LOJA NOVA
 * ---------------------------------------------------------------
 * Ao criar a conta, a loja precisa nascer pronta para vender: tamanhos,
 * cores, categorias de produto, categorias financeiras, centro de custo,
 * conta de caixa, depósito e as configurações dela.
 *
 * Antes isso era feito uma única vez para o sistema inteiro (scripts/migrate).
 * Com várias lojas, cada uma recebe o seu conjunto — sempre amarrado ao
 * company_id da própria loja.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  bankAccounts,
  categories,
  colors,
  costCenters,
  financeCategories,
  sizes,
  warehouses,
} from "../db/schema";
import { getSettingsFor } from "./settings";
import { withCompany } from "../db/tenant";

const SIZES: Array<[string, number]> = [
  ["PP", 1], ["P", 2], ["M", 3], ["G", 4], ["GG", 5], ["XG", 6],
  ["34", 10], ["36", 11], ["38", 12], ["40", 13], ["42", 14], ["44", 15],
  ["46", 16], ["48", 17], ["50", 18], ["Único", 30],
];

const COLORS: Array<[string, string, number]> = [
  ["Preto", "#111111", 1], ["Branco", "#FFFFFF", 2], ["Off-white", "#F5F0E6", 3],
  ["Azul", "#1E40AF", 4], ["Azul Jeans", "#3B5C8A", 5], ["Bege", "#D9C9A8", 6],
  ["Rosé", "#D8A0A6", 7], ["Vermelho", "#B91C1C", 8], ["Verde", "#15803D", 9],
  ["Marrom", "#6B4423", 10], ["Cinza", "#6B7280", 11], ["Rosa", "#EC4899", 12],
  ["Nude", "#E8D3C4", 13], ["Dourado", "#C9A227", 14],
];

const PRODUCT_CATEGORIES: Array<[string, number]> = [
  ["Vestidos", 1], ["Blusas", 2], ["Camisetas", 3], ["Calças", 4], ["Shorts e Bermudas", 5],
  ["Saias", 6], ["Jaquetas e Casacos", 7], ["Macacões", 8], ["Conjuntos", 9],
  ["Acessórios", 10], ["Calçados", 11], ["Moda Íntima", 12], ["Plus Size", 13],
];

const FINANCE_CATEGORIES: Array<[string, "INCOME" | "EXPENSE", string]> = [
  ["Vendas de Mercadorias", "INCOME", "REVENUE"],
  ["Receitas de Serviços", "INCOME", "REVENUE"],
  ["Outras Receitas", "INCOME", "OTHER_INCOME"],
  ["Devoluções e Cancelamentos", "EXPENSE", "DEDUCTION"],
  ["Impostos sobre Vendas", "EXPENSE", "DEDUCTION"],
  ["Custo de Mercadorias Vendidas", "EXPENSE", "COGS"],
  ["Aluguel", "EXPENSE", "OPERATING_EXPENSE"],
  ["Água e Energia", "EXPENSE", "OPERATING_EXPENSE"],
  ["Internet e Telefonia", "EXPENSE", "OPERATING_EXPENSE"],
  ["Salários e Encargos", "EXPENSE", "OPERATING_EXPENSE"],
  ["Marketing e Publicidade", "EXPENSE", "OPERATING_EXPENSE"],
  ["Despesas Administrativas", "EXPENSE", "OPERATING_EXPENSE"],
  ["Despesas Bancárias e Taxas", "EXPENSE", "OPERATING_EXPENSE"],
  ["Outras Despesas", "EXPENSE", "OTHER_EXPENSE"],
];

/**
 * Cria tudo que uma loja precisa para começar a operar.
 * É idempotente: rodar de novo não duplica nada.
 */
export async function seedCompanyDefaults(companyId: string): Promise<void> {
  await withCompany(companyId, async () => {
    // configurações da loja (nascem com valores padrão)
    await getSettingsFor(companyId);

    const jaTemDeposito = await db.select({ id: warehouses.id }).from(warehouses).limit(1);
    if (!jaTemDeposito[0]) {
      await db.insert(warehouses).values({ name: "Loja Principal", isDefault: true, isActive: true });
    }

    const jaTemCentroCusto = await db.select({ id: costCenters.id }).from(costCenters).limit(1);
    if (!jaTemCentroCusto[0]) {
      await db.insert(costCenters).values({ name: "Loja Física" });
    }

    const jaTemCaixa = await db.select({ id: bankAccounts.id }).from(bankAccounts).limit(1);
    if (!jaTemCaixa[0]) {
      await db.insert(bankAccounts).values({
        name: "Caixa Loja",
        type: "CASH",
        bankName: null,
        currentBalance: "0",
        initialBalance: "0",
      });
    }

    const tamanhos = await db.select({ name: sizes.name }).from(sizes);
    if (tamanhos.length === 0) {
      await db.insert(sizes).values(
        SIZES.map(([name, order]) => ({
          name,
          sortOrder: order,
          type: name === "Único" ? "FREE" : "APPAREL",
        })),
      );
    }

    const cores = await db.select({ name: colors.name }).from(colors);
    if (cores.length === 0) {
      await db.insert(colors).values(
        COLORS.map(([name, hex, order]) => ({ name, hex, sortOrder: order })),
      );
    }

    const categorias = await db.select({ name: categories.name }).from(categories);
    if (categorias.length === 0) {
      await db.insert(categories).values(
        PRODUCT_CATEGORIES.map(([name, order]) => ({ name, sortOrder: order })),
      );
    }

    const finCats = await db.select({ name: financeCategories.name }).from(financeCategories);
    if (finCats.length === 0) {
      await db.insert(financeCategories).values(
        FINANCE_CATEGORIES.map(([name, type, dreGroup]) => ({
          name,
          type,
          dreGroup: dreGroup as "REVENUE",
        })),
      );
    }
  });
}

/** Loja do usuário (usado no login para saber onde amarrar a sessão). */
export async function companyOfUser(userId: string): Promise<string | null> {
  const { users } = await import("../db/schema");
  const rows = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.companyId ?? null;
}
