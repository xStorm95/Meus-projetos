/**
 * Serviço de estoque — toda alteração de saldo passa por aqui.
 *
 * Garantias:
 *  - Cada movimentação grava histórico completo (produto, variação, tipo,
 *    quantidade, saldo após, usuário, motivo, documento de origem).
 *  - O saldo é atualizado com UPDATE atômico (SET quantity = quantity + delta),
 *    evitando condição de corrida em vendas simultâneas.
 *  - Estoque negativo é bloqueado, salvo configuração allowNegativeStock ou
 *    permissão explícita.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  productVariants,
  products,
  stockLevels,
  stockMovements,
  stockTransferItems,
  stockTransfers,
  warehouses,
} from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../lib/errors";
import { money } from "../lib/money";
import { nextSequence, formatCode } from "../lib/sequences";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type MovementType = (typeof stockMovements.$inferInsert)["type"];

export async function getDefaultWarehouse(tx: Tx | Database) {
  const rows = await (tx as Database)
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.isDefault, true), eq(warehouses.isActive, true)))
    .limit(1);
  if (rows[0]) return rows[0];
  const any = await (tx as Database)
    .select()
    .from(warehouses)
    .where(eq(warehouses.isActive, true))
    .limit(1);
  if (!any[0]) throw new NotFoundError("Depósito padrão");
  return any[0];
}

export async function getVariantWithProduct(tx: Tx | Database, variantId: string) {
  const rows = await (tx as Database)
    .select({
      variant: productVariants,
      product: products,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Variação de produto");
  return rows[0];
}

/** Stock disponível = saldo - reservado. */
export function availableQty(stockQty: string, reservedQty: string): number {
  return Number(stockQty) - Number(reservedQty);
}

type MoveStockParams = {
  variantId: string;
  warehouseId: string;
  /** Positivo = entrada, negativo = saída */
  delta: number;
  type: MovementType;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  userId?: string | null;
  userName?: string | null;
  unitCost?: string;
  /** Permitir saldo negativo (configuração/permissão) */
  allowNegative?: boolean;
};

/**
 * Executa uma movimentação de estoque dentro de uma transação.
 * Retorna o saldo após a operação.
 */
export async function moveStock(tx: Tx, params: MoveStockParams): Promise<number> {
  if (params.delta === 0) {
    throw new BusinessRuleError("A quantidade da movimentação não pode ser zero.");
  }

  const { variant, product } = await getVariantWithProduct(tx, params.variantId);

  // Atualiza saldo do depósito de forma atômica
  const levelRows = await tx
    .insert(stockLevels)
    .values({
      variantId: params.variantId,
      warehouseId: params.warehouseId,
      quantity: "0",
    })
    .onConflictDoNothing()
    .returning();

  const updated = await tx.execute(sql`
    UPDATE stock_levels
       SET quantity = quantity + ${params.delta}::numeric, updated_at = now()
     WHERE variant_id = ${params.variantId} AND warehouse_id = ${params.warehouseId}
     RETURNING quantity
  `);
  const warehouseBalance = Number(
    (updated.rows as Array<{ quantity: string }>)[0]?.quantity ?? 0,
  );
  void levelRows;

  // Saídas é que não podem deixar o saldo negativo; entradas sempre são
  // permitidas (inclusive para corrigir saldos negativos já existentes).
  if (warehouseBalance < 0 && params.delta < 0 && !params.allowNegative) {
    throw new BusinessRuleError(
      `Estoque insuficiente para ${product.name} (${variant.sku}). ` +
        `Disponível: ${warehouseBalance + Math.abs(params.delta)} un., solicitado: ${Math.abs(params.delta)} un.`,
      { variantId: params.variantId, available: warehouseBalance + Math.abs(params.delta) },
    );
  }

  // Saldo consolidado da variação (todos os depósitos)
  const consolidated = await tx.execute(sql`
    UPDATE product_variants
       SET stock_qty = stock_qty + ${params.delta}::numeric, updated_at = now()
     WHERE id = ${params.variantId}
     RETURNING stock_qty
  `);
  const newBalance = Number(
    (consolidated.rows as Array<{ stock_qty: string }>)[0]?.stock_qty ?? 0,
  );

  if (newBalance < 0 && params.delta < 0 && !params.allowNegative) {
    // Desfaz para manter consistência
    throw new BusinessRuleError(
      `Estoque insuficiente para ${product.name} (${variant.sku}). Saldo resultante seria negativo.`,
    );
  }

  await tx.insert(stockMovements).values({
    variantId: params.variantId,
    productId: product.id,
    warehouseId: params.warehouseId,
    type: params.type,
    quantity: money(params.delta),
    balanceAfter: money(newBalance),
    unitCost: params.unitCost ? money(params.unitCost) : money(variant.costPrice),
    referenceType: params.referenceType ?? null,
    referenceId: params.referenceId ?? null,
    reason: params.reason ?? null,
    userId: params.userId ?? null,
    userName: params.userName ?? null,
  });

  return newBalance;
}

/** Ajuste manual / inventário com motivo obrigatório. */
export async function adjustStock(tx: Tx, params: {
  variantId: string;
  warehouseId?: string;
  newQuantity: number;
  reason: string;
  userId?: string | null;
  userName?: string | null;
  referenceType?: string;
  referenceId?: string;
}) {
  if (!params.reason?.trim()) {
    throw new BusinessRuleError("Informe o motivo do ajuste de estoque.");
  }
  const warehouseId = params.warehouseId ?? (await getDefaultWarehouse(tx)).id;
  const { variant } = await getVariantWithProduct(tx, params.variantId);

  const levelRows = await tx
    .select()
    .from(stockLevels)
    .where(
      and(
        eq(stockLevels.variantId, params.variantId),
        eq(stockLevels.warehouseId, warehouseId),
      ),
    )
    .limit(1);
  const currentWarehouseQty = Number(levelRows[0]?.quantity ?? 0);
  const delta = params.newQuantity - currentWarehouseQty;
  if (delta === 0) return Number(variant.stockQty);

  return moveStock(tx, {
    variantId: params.variantId,
    warehouseId,
    delta,
    type: "ADJUSTMENT",
    reason: params.reason,
    userId: params.userId,
    userName: params.userName,
    referenceType: params.referenceType ?? "MANUAL",
    referenceId: params.referenceId,
    allowNegative: params.newQuantity >= 0,
  });
}

/** Reserva de estoque (ex.: orçamento aprovado aguardando pagamento). */
export async function reserveStock(
  tx: Tx,
  params: { variantId: string; quantity: number },
) {
  const { variant } = await getVariantWithProduct(tx, params.variantId);
  const available = availableQty(variant.stockQty, variant.reservedQty);
  if (available < params.quantity) {
    throw new BusinessRuleError(
      `Estoque disponível insuficiente para reserva (${available} disponível, ${params.quantity} solicitado).`,
    );
  }
  await tx
    .update(productVariants)
    .set({ reservedQty: money(Number(variant.reservedQty) + params.quantity) })
    .where(eq(productVariants.id, params.variantId));
}

export async function releaseReservation(tx: Tx, params: { variantId: string; quantity: number }) {
  const { variant } = await getVariantWithProduct(tx, params.variantId);
  const next = Math.max(0, Number(variant.reservedQty) - params.quantity);
  await tx
    .update(productVariants)
    .set({ reservedQty: money(next) })
    .where(eq(productVariants.id, params.variantId));
}

/** Transferência entre depósitos. */
export async function createTransfer(params: {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ variantId: string; quantity: number }>;
  notes?: string;
  userId?: string | null;
  userName?: string | null;
}) {
  const { db } = await import("../db/client");
  if (params.fromWarehouseId === params.toWarehouseId) {
    throw new BusinessRuleError("Os depósitos de origem e destino devem ser diferentes.");
  }
  if (!params.items.length) throw new BusinessRuleError("Informe ao menos um item para transferir.");

  return db.transaction(async (tx) => {
    const seq = await nextSequence(tx, "transfer");
    const code = await formatCode("TR", seq);
    const [transfer] = await tx
      .insert(stockTransfers)
      .values({
        code,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        notes: params.notes ?? null,
        createdBy: params.userId ?? null,
      })
      .returning();

    for (const item of params.items) {
      if (item.quantity <= 0) throw new BusinessRuleError("Quantidade deve ser maior que zero.");
      await tx.insert(stockTransferItems).values({
        transferId: transfer.id,
        variantId: item.variantId,
        quantity: money(item.quantity),
      });
      await moveStock(tx, {
        variantId: item.variantId,
        warehouseId: params.fromWarehouseId,
        delta: -item.quantity,
        type: "TRANSFER_OUT",
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        reason: `Transferência ${code}`,
        userId: params.userId,
        userName: params.userName,
      });
      await moveStock(tx, {
        variantId: item.variantId,
        warehouseId: params.toWarehouseId,
        delta: item.quantity,
        type: "TRANSFER_IN",
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        reason: `Transferência ${code}`,
        userId: params.userId,
        userName: params.userName,
      });
    }
    return transfer;
  });
}
