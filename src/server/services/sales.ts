/**
 * Serviço de vendas (PDV) — núcleo transacional do ERP.
 *
 * `createSale` executa em UMA transação de banco:
 *   1. valida itens, preços e disponibilidade de estoque
 *   2. calcula subtotal, desconto, acréscimo, total e custo (CMV)
 *   3. grava a venda e os itens
 *   4. baixa o estoque e grava o histórico de movimentação
 *   5. registra os pagamentos
 *   6. gera contas a receber (crediário/cartão parcelado) e movimentos de caixa
 *   7. atualiza o caixa aberto e o cliente
 *   8. registra auditoria
 * Se qualquer etapa falhar, NADA é gravado.
 */
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  cashMovements,
  cashSessions,
  customerCredits,
  customers,
  productVariants,
  products,
  receivables,
  saleItems,
  salePayments,
  sales,
  users,
  type salePayments as SalePaymentsTable,
} from "../db/schema";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../lib/errors";
import { d, money, sum, sub, mul, gt, lte, splitInstallments } from "../lib/money";
import { addDaysKey, addMonthsKey, todayKey } from "../lib/dates";
import { nextSequence } from "../lib/sequences";
import { getDefaultWarehouse, moveStock, getVariantWithProduct } from "./stock";
import { getSettingsCached } from "./settings";
import { writeAudit } from "../lib/audit";

type PaymentInput = {
  method: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "TRANSFER" | "OTHER";
  amount: number | string;
  installments?: number;
  tenderedAmount?: number | string;
  firstDueDate?: string;
  cardBrand?: string;
  authorizationCode?: string;
  notes?: string;
};

export type ItemInput = {
  variantId?: string;
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice?: number | string;
  discountAmount?: number | string;
  surchargeAmount?: number | string;
};

export type CreateSaleInput = {
  customerId?: string | null;
  sellerId?: string | null;
  items: ItemInput[];
  payments: PaymentInput[];
  discountPercent?: number;
  discountAmount?: number;
  surchargeAmount?: number;
  discountReason?: string;
  notes?: string;
  /** Mantém a venda em aberto (não baixa estoque nem gera financeiro) */
  saveAsOpen?: boolean;
  quoteId?: string | null;
  originType?: string;
  /** Uso interno: trocas geram venda de origem EXCHANGE */
  internal?: boolean;
};

export type Actor = {
  id: string;
  name: string;
  maxDiscountPercent: number;
  canUnlimitedDiscount: boolean;
  canNegativeStock: boolean;
};

/**
 * Calcula os totais de uma venda sem gravar nada (usado no PDV e nos testes).
 */
export async function previewSale(input: CreateSaleInput) {
  const settings = await getSettingsCached();
  let subtotal = d(0);
  let itemsCost = d(0);
  const enriched: Array<{
    variantId: string;
    productId: string;
    description: string;
    sku: string;
    barcode: string | null;
    colorName: string | null;
    sizeName: string | null;
    quantity: number;
    unitPrice: string;
    unitCost: string;
    discountAmount: string;
    surchargeAmount: string;
    total: string;
    stockAvailable: number;
  }> = [];

  for (const item of input.items) {
    if (!item.variantId) {
      throw new BusinessRuleError(
        item.description
          ? `Informe a variação (cor/tamanho) do produto "${item.description}".`
          : "Selecione uma variação de produto válida.",
      );
    }
    const { variant, product } = await getVariantWithProduct(db, item.variantId);
    if (product.status !== "ACTIVE" || product.deletedAt) {
      throw new BusinessRuleError(`O produto "${product.name}" está inativo.`);
    }
    if (!variant.isActive) {
      throw new BusinessRuleError(`A variação ${variant.sku} está inativa.`);
    }
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BusinessRuleError(`Quantidade inválida para "${product.name}".`);
    }

    const isPromo = variant.promoPrice
      ? gt(variant.promoPrice, 0) &&
        (!product.promoStartsAt ||
          product.promoStartsAt <= todayKey()) &&
        (!product.promoEndsAt || product.promoEndsAt >= todayKey())
      : false;
    const listPrice = isPromo && variant.promoPrice ? variant.promoPrice : variant.salePrice;
    const unitPrice = item.unitPrice !== undefined ? money(item.unitPrice) : money(listPrice);
    if (d(unitPrice).lt(0)) throw new BusinessRuleError("O preço unitário não pode ser negativo.");

    const lineBase = d(unitPrice).times(qty);
    const itemDiscount = d(item.discountAmount ?? 0);
    const itemSurcharge = d(item.surchargeAmount ?? 0);
    if (itemDiscount.gt(lineBase)) {
      throw new BusinessRuleError(
        `Desconto maior que o valor do item "${product.name}".`,
      );
    }
    const lineTotal = lineBase.minus(itemDiscount).plus(itemSurcharge);

    subtotal = subtotal.plus(lineBase);
    itemsCost = itemsCost.plus(d(variant.costPrice).times(qty));

    const available = Number(variant.stockQty) - Number(variant.reservedQty);
    enriched.push({
      variantId: variant.id,
      productId: product.id,
      description: product.name,
      sku: variant.sku,
      barcode: variant.barcode,
      colorName: variant.colorName,
      sizeName: variant.sizeName,
      quantity: qty,
      unitPrice: money(unitPrice),
      unitCost: money(variant.costPrice),
      discountAmount: money(itemDiscount),
      surchargeAmount: money(itemSurcharge),
      total: money(lineTotal),
      stockAvailable: available,
    });
  }

  if (!enriched.length) throw new BusinessRuleError("Adicione ao menos um produto à venda.");

  const itemDiscounts = enriched.reduce((acc, i) => acc.plus(d(i.discountAmount)), d(0));
  const itemSurcharges = enriched.reduce((acc, i) => acc.plus(d(i.surchargeAmount)), d(0));
  const saleDiscount =
    d(input.discountAmount ?? 0).gt(0)
      ? d(input.discountAmount ?? 0)
      : subtotal.times(d(input.discountPercent ?? 0)).dividedBy(100);
  const saleSurcharge = d(input.surchargeAmount ?? 0);

  const totalDiscount = itemDiscounts.plus(saleDiscount);
  const ifDiscountOverSubtotal = totalDiscount.gt(subtotal);
  if (ifDiscountOverSubtotal) {
    throw new BusinessRuleError("O desconto total não pode ser maior que o subtotal.");
  }
  if (saleDiscount.gt(0) && !input.discountReason?.trim() && settings.requireDiscountReason) {
    throw new BusinessRuleError("Informe o motivo do desconto.");
  }

  const total = subtotal.minus(saleDiscount).plus(itemSurcharges).plus(saleSurcharge);
  const discountPercent = subtotal.isZero()
    ? d(0)
    : totalDiscount.dividedBy(subtotal).times(100);

  return {
    items: enriched,
    subtotal: money(subtotal),
    itemDiscounts: money(itemDiscounts),
    itemSurcharges: money(itemSurcharges),
    discountAmount: money(totalDiscount),
    discountPercent: money(discountPercent),
    surchargeAmount: money(itemSurcharges.plus(saleSurcharge)),
    total: money(total),
    costTotal: money(itemsCost),
    profit: money(total.minus(itemsCost)),
    itemCount: enriched.reduce((acc, i) => acc + i.quantity, 0),
  };
}

/** Valida que os pagamentos cobrem exatamente o total (permitindo troco em dinheiro). */
function validatePayments(payments: PaymentInput[], total: string) {
  if (!payments.length) throw new BusinessRuleError("Informe ao menos uma forma de pagamento.");
  let paid = d(0);
  let hasCredit = false;
  let change = d(0);

  for (const p of payments) {
    const amount = d(p.amount);
    if (amount.lt(0)) throw new BusinessRuleError("Valor de pagamento inválido.");
    if (p.method === "STORE_CREDIT") hasCredit = true;
    if (p.method === "CASH" && p.tenderedAmount !== undefined) {
      const tendered = d(p.tenderedAmount);
      if (tendered.lt(amount)) {
        throw new BusinessRuleError("O valor entregue em dinheiro é menor que o valor do pagamento.");
      }
      change = change.plus(tendered.minus(amount));
    }
    if ((p.method === "CREDIT" || p.method === "STORE_CREDIT") && p.installments && p.installments > 1) {
      if (p.installments > 36) throw new BusinessRuleError("Máximo de 36 parcelas.");
    }
    paid = paid.plus(amount);
  }

  if (paid.lt(d(total))) {
    throw new BusinessRuleError(
      `Pagamento insuficiente: total R$ ${money(total)}, informado R$ ${money(paid)}.`,
    );
  }
  if (gt(paid.minus(d(total)), 0) && !payments.some((p) => p.method === "CASH")) {
    throw new BusinessRuleError("O valor pago excede o total da venda. Verifique os pagamentos.");
  }
  void hasCredit;
  return { paid: money(paid), change: money(change) };
}

/**
 * Cria e finaliza a venda de forma transacional.
 */
export async function createSale(input: CreateSaleInput, actor: Actor) {
  const settings = await getSettingsCached();
  const preview = await previewSale(input);

  // Regra de desconto máximo conforme perfil
  const requestedPercent = Number(preview.discountPercent);
  if (!actor.canUnlimitedDiscount && requestedPercent > actor.maxDiscountPercent) {
    throw new ForbiddenError(
      `Desconto de ${requestedPercent.toFixed(2)}% excede o limite de ${actor.maxDiscountPercent}% do seu perfil.`,
    );
  }

  const openSession = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.status, "OPEN"), eq(cashSessions.userId, actor.id)))
    .limit(1);

  return db.transaction(async (tx) => {
    const sequenceKey = "sale";
    const number = await nextSequence(tx, sequenceKey);

    let paidInfo = { paid: "0.00", change: "0.00" };
    if (!input.saveAsOpen) {
      paidInfo = validatePayments(input.payments, preview.total);
    }

    const [sale] = await tx
      .insert(sales)
      .values({
        number,
        status: input.saveAsOpen ? "OPEN" : "COMPLETED",
        customerId: input.customerId ?? null,
        sellerId: input.sellerId ?? actor.id,
        operatorId: actor.id,
        cashSessionId: openSession[0]?.id ?? null,
        subtotal: preview.subtotal,
        discountAmount: preview.discountAmount,
        discountPercent: preview.discountPercent,
        surchargeAmount: preview.surchargeAmount,
        total: preview.total,
        costTotal: preview.costTotal,
        profit: input.saveAsOpen ? "0.00" : preview.profit,
        paidAmount: input.saveAsOpen ? "0.00" : paidInfo.paid,
        changeAmount: input.saveAsOpen ? "0.00" : paidInfo.change,
        itemCount: preview.itemCount,
        notes: input.notes ?? null,
        discountReason: input.discountReason ?? null,
        quoteId: input.quoteId ?? null,
        originType: input.originType ?? "PDV",
        completedAt: input.saveAsOpen ? null : new Date(),
      })
      .returning();

    // Itens
    await tx.insert(saleItems).values(
      preview.items.map((i) => ({
        saleId: sale.id,
        productId: i.productId,
        variantId: i.variantId,
        description: i.description,
        sku: i.sku,
        barcode: i.barcode,
        colorName: i.colorName,
        sizeName: i.sizeName,
        quantity: money(i.quantity),
        unitPrice: i.unitPrice,
        unitCost: i.unitCost,
        discountAmount: i.discountAmount,
        surchargeAmount: i.surchargeAmount,
        total: i.total,
      })),
    );

    if (input.saveAsOpen) {
      await writeAudit({
        userId: actor.id,
        userName: actor.name,
        action: "SALE_OPEN",
        entity: "sale",
        entityId: sale.id,
        description: `Venda em aberto #${number} salva`,
      }, tx);
      return { sale, change: "0.00", paid: "0.00", receivables: [] as string[] };
    }

    // Baixa de estoque (atômica com a venda)
    const warehouse = await getDefaultWarehouse(tx);
    const combine = new Map<string, number>();
    for (const i of preview.items) {
      combine.set(i.variantId, (combine.get(i.variantId) ?? 0) + i.quantity);
    }
    if (!input.internal) {
      for (const [variantId, qty] of combine) {
        await moveStock(tx, {
          variantId,
          warehouseId: warehouse.id,
          delta: -qty,
          type: "SALE",
          referenceType: "SALE",
          referenceId: sale.id,
          reason: `Venda #${number}`,
          userId: actor.id,
          userName: actor.name,
          allowNegative: actor.canNegativeStock || settings.allowNegativeStock,
        });
      }
    }

    // Pagamentos + financeiro
    const receivableIds: string[] = [];
    let creditUsed = d(0);

    for (const payment of input.payments) {
      const amount = money(payment.amount);
      if (lte(amount, 0)) continue;
      const installments = Math.max(1, Math.trunc(payment.installments ?? 1));
      const changeForPayment =
        payment.method === "CASH" && payment.tenderedAmount !== undefined
          ? money(d(payment.tenderedAmount).minus(d(payment.amount)))
          : "0.00";

      const [inserted] = await tx
        .insert(salePayments)
        .values({
          saleId: sale.id,
          method: payment.method,
          amount,
          installments,
          tenderedAmount:
            payment.tenderedAmount !== undefined ? money(payment.tenderedAmount) : null,
          changeAmount: changeForPayment,
          firstDueDate: payment.firstDueDate ?? null,
          cardBrand: payment.cardBrand ?? null,
          authorizationCode: payment.authorizationCode ?? null,
          notes: payment.notes ?? null,
        })
        .returning();

      // Crediário próprio e cartão de crédito parcelado => contas a receber
      const isCreditSale =
        payment.method === "STORE_CREDIT" || (payment.method === "CREDIT" && installments > 1);

      if (isCreditSale) {
        if (payment.method === "STORE_CREDIT") {
          creditUsed = creditUsed.plus(d(amount));
        }
        const first = payment.firstDueDate ?? todayKey();
        const parcels = splitInstallments(amount, installments);
        for (let i = 0; i < parcels.length; i++) {
          const dueDate = i === 0
            ? (payment.firstDueDate || addDaysKey(todayKey(), 30))
            : addMonthsKey(first, i);
          const [rec] = await tx
            .insert(receivables)
            .values({
              customerId: input.customerId ?? null,
              saleId: sale.id,
              salePaymentId: inserted.id,
              source: "SALE",
              description: `Venda #${number} — parcela ${i + 1}/${parcels.length}`,
              installmentNumber: i + 1,
              installmentTotal: parcels.length,
              amount: parcels[i],
              dueDate,
              status: "PENDING",
              createdBy: actor.id,
            })
            .returning();
          receivableIds.push(rec.id);
        }
        if (!input.customerId) {
          throw new BusinessRuleError(
            "Venda a prazo (crediário) exige um cliente identificado com CPF.",
          );
        }
      } else {
        // Recebimento imediato -> movimento de caixa
        if (openSession[0]) {
          await tx.insert(cashMovements).values({
            sessionId: openSession[0].id,
            type: "SALE",
            method: payment.method,
            amount,
            description: `Venda #${number}`,
            referenceType: "SALE",
            referenceId: sale.id,
            userId: actor.id,
            userName: actor.name,
          });
        }
      }
    }

    /*
     * Limite de crédito (crediário da loja).
     *
     * O campo `creditLimit` do cliente era gravado mas NUNCA usado: o PDV
     * oferecia "Crediário", a venda era recusada com "Saldo de crédito
     * insuficiente" (comparando com crédito de troca, que é outra coisa) e
     * ninguém conseguia vender no crediário.
     *
     * Regra: limite disponível = creditLimit - dívida em aberto.
     */
    if (creditUsed.gt(0) && input.customerId) {
      const [cliente] = await tx
        .select({ creditLimit: customers.creditLimit })
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .limit(1);
      if (!cliente) throw new BusinessRuleError("Cliente não encontrado para o crediário.");

      /*
       * Cuidado: as parcelas DESTA venda já foram gravadas acima (mesma
       * transação). Somá-las aqui fazia a compra ser comparada consigo mesma
       * e recusar vendas dentro do limite (limite 300, compra 250 → "em
       * aberto: 250"). Só a dívida ANTERIOR consome o limite.
       */
      const [divida] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${receivables.amount} - ${receivables.paidAmount}), 0)::text` })
        .from(receivables)
        .where(
          and(
            eq(receivables.customerId, input.customerId),
            sql`${receivables.status} IN ('PENDING','PARTIAL','OVERDUE')`,
            or(isNull(receivables.saleId), ne(receivables.saleId, sale.id)),
          ),
        );

      const limite = d(cliente.creditLimit);
      const emAberto = d(divida?.total ?? "0");
      const disponivel = limite.minus(emAberto);

      if (disponivel.lte(0) || creditUsed.gt(disponivel)) {
        throw new BusinessRuleError(
          `Limite de crédito insuficiente. Limite: R$ ${money(limite)}, em aberto: R$ ${money(emAberto)}, ` +
            `disponível: R$ ${money(disponivel.lt(0) ? 0 : disponivel)}. Ajuste o limite na ficha do cliente ou use outra forma de pagamento.`,
        );
      }
    }

    /*
     * Crédito de TROCA/DEVOLUÇÃO (customer_credits) — é o que o PDV consome
     * automaticamente. Se a loja usa o limite do cliente (creditLimit) em vez
     * de crédito de troca, o bloco de limite acima já validou; aqui só falha
     * se não houver saldo de troca E o cliente não tiver limite cadastrado.
     */
    if (creditUsed.gt(0)) {
      if (!input.customerId) {
        throw new BusinessRuleError("Uso de crédito exige cliente identificado.");
      }
      let remaining = creditUsed;
      const credits = await tx
        .select()
        .from(customerCredits)
        .where(
          and(
            eq(customerCredits.customerId, input.customerId),
            eq(customerCredits.isActive, true),
            sql`${customerCredits.amount}::numeric > ${customerCredits.usedAmount}::numeric`,
          ),
        )
        .orderBy(customerCredits.createdAt);
      for (const credit of credits) {
        if (remaining.lte(0)) break;
        const available = d(credit.amount).minus(d(credit.usedAmount));
        const use = remaining.lt(available) ? remaining : available;
        await tx
          .update(customerCredits)
          .set({ usedAmount: money(d(credit.usedAmount).plus(use)) })
          .where(eq(customerCredits.id, credit.id));
        remaining = remaining.minus(use);
      }
      if (remaining.gt(0)) {
        // Se o cliente paga pelo LIMITE do crediário (e não por crédito de
        // troca), o saldo de "troca" é irrelevante: a validação já aconteceu.
        const usaCreditoDeTroca = credits.length > 0;
        if (!usaCreditoDeTroca) {
          remaining = d(0);
        }
      }
      if (remaining.gt(0)) {
        throw new BusinessRuleError(
          `Saldo de crédito de troca insuficiente. Faltam R$ ${money(remaining)}.`,
        );
      }
    }

    // Marca venda em aberto / orçamento como convertido
    if (input.quoteId) {
      await tx.execute(sql`
        UPDATE quotes SET status = 'CONVERTED', converted_sale_id = ${sale.id}, updated_at = now()
        WHERE id = ${input.quoteId}
      `);
    }

    // Atualiza totais do caixa
    if (openSession[0]) {
      await tx.execute(sql`
        UPDATE cash_sessions
           SET sales_total = sales_total + ${preview.total}::numeric
         WHERE id = ${openSession[0].id}
      `);
    }

    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      action: "SALE_CREATE",
      entity: "sale",
      entityId: sale.id,
      description: `Venda #${number} finalizada — total R$ ${preview.total}`,
      after: {
        number,
        total: preview.total,
        items: preview.items.length,
        customerId: input.customerId,
      },
    }, tx);

    return { sale, change: paidInfo.change, paid: paidInfo.paid, receivables: receivableIds };
  });
}

/** Cancela uma venda: devolve estoque, estorna caixa e cancela parcelas. */
export async function cancelSale(params: {
  saleId: string;
  reason: string;
  actor: Actor;
}) {
  if (!params.reason?.trim()) throw new BusinessRuleError("Informe a justificativa do cancelamento.");
  const settings = await getSettingsCached();

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(sales).where(eq(sales.id, params.saleId)).limit(1);
    const sale = rows[0];
    if (!sale) throw new NotFoundError("Venda");
    if (sale.status === "CANCELED") throw new BusinessRuleError("Esta venda já está cancelada.");

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const warehouse = await getDefaultWarehouse(tx);

    if (sale.status === "COMPLETED") {
      for (const item of items) {
        if (!item.variantId) continue;
        const qty = Number(item.quantity) - Number(item.returnedQty);
        if (qty <= 0) continue;
        await moveStock(tx, {
          variantId: item.variantId,
          warehouseId: warehouse.id,
          delta: qty,
          type: "CANCEL_SALE",
          referenceType: "SALE_CANCEL",
          referenceId: sale.id,
          reason: `Cancelamento da venda #${sale.number}: ${params.reason}`,
          userId: params.actor.id,
          userName: params.actor.name,
          allowNegative: true,
        });
      }

      // Estorna movimentos de caixa da venda
      if (sale.cashSessionId) {
        await tx.insert(cashMovements).values({
          sessionId: sale.cashSessionId,
          type: "REFUND",
          amount: money(-Number(sale.total)),
          description: `Estorno da venda #${sale.number} (cancelamento)`,
          referenceType: "SALE",
          referenceId: sale.id,
          userId: params.actor.id,
          userName: params.actor.name,
        });
        await tx.execute(sql`
          UPDATE cash_sessions SET sales_total = sales_total - ${sale.total}::numeric
          WHERE id = ${sale.cashSessionId}
        `);
      }

      // Cancela parcelas em aberto
      await tx.execute(sql`
        UPDATE receivables
           SET status = 'CANCELED', updated_at = now(),
               notes = COALESCE(notes, '') || ' | Cancelada por cancelamento da venda'
         WHERE sale_id = ${sale.id} AND status IN ('PENDING','PARTIAL','OVERDUE')
      `);
    }

    await tx
      .update(sales)
      .set({
        status: "CANCELED",
        canceledAt: new Date(),
        canceledBy: params.actor.id,
        cancelReason: params.reason,
        profit: "0.00",
        updatedAt: new Date(),
      })
      .where(eq(sales.id, sale.id));

    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "SALE_CANCEL",
      entity: "sale",
      entityId: sale.id,
      description: `Venda #${sale.number} cancelada. Motivo: ${params.reason}`,
      before: { status: sale.status, total: sale.total },
      after: { status: "CANCELED", total: sale.total, reason: params.reason },
    }, tx);

    void settings;
    return { sale };
  });
}

/** Adiciona pagamento a uma venda em aberto e finaliza. */
export async function finalizeOpenSale(params: {
  saleId: string;
  payments: PaymentInput[];
  actor: Actor;
}) {
  // Lê a venda em aberto ANTES da transação (o preview consulta o banco
  // com a conexão do pool, o que não pode acontecer dentro do tx).
  const headRows = await db.select().from(sales).where(eq(sales.id, params.saleId)).limit(1);
  const head = headRows[0];
  if (!head) throw new NotFoundError("Venda");
  if (head.status !== "OPEN") {
    throw new BusinessRuleError("Somente vendas em aberto podem ser finalizadas.");
  }
  const headItems = await db.select().from(saleItems).where(eq(saleItems.saleId, head.id));
  const preview = await previewSale({
    customerId: head.customerId,
    items: headItems.map((i) => ({
      variantId: i.variantId ?? undefined,
      quantity: Number(i.quantity),
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      surchargeAmount: i.surchargeAmount,
    })),
    payments: params.payments,
    discountPercent: Number(head.discountPercent),
    notes: head.notes ?? undefined,
  });
  if (Math.abs(Number(preview.total) - Number(head.total)) > 0.01) {
    throw new BusinessRuleError("Os preços dos produtos mudaram. Reabra a venda para recalculá-la.");
  }
  const paidInfo = validatePayments(params.payments, preview.total);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(sales).where(eq(sales.id, params.saleId)).limit(1);
    const sale = rows[0];
    if (!sale) throw new NotFoundError("Venda");
    if (sale.status !== "OPEN") {
      throw new BusinessRuleError("Esta venda já foi finalizada por outro usuário.");
    }
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const warehouse = await getDefaultWarehouse(tx);
    const openSession = await tx
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.status, "OPEN"), eq(cashSessions.userId, params.actor.id)))
      .limit(1);

    for (const item of items) {
      if (!item.variantId) continue;
      await moveStock(tx, {
        variantId: item.variantId,
        warehouseId: warehouse.id,
        delta: -Number(item.quantity),
        type: "SALE",
        referenceType: "SALE",
        referenceId: sale.id,
        reason: `Venda #${sale.number}`,
        userId: params.actor.id,
        userName: params.actor.name,
      });
    }

    for (const payment of params.payments) {
      const amount = money(payment.amount);
      if (lte(amount, 0)) continue;
      const installments = Math.max(1, Math.trunc(payment.installments ?? 1));
      const [inserted] = await tx
        .insert(salePayments)
        .values({
          saleId: sale.id,
          method: payment.method,
          amount,
          installments,
          tenderedAmount: payment.tenderedAmount !== undefined ? money(payment.tenderedAmount) : null,
          firstDueDate: payment.firstDueDate ?? null,
        })
        .returning();
      const isCreditSale =
        payment.method === "STORE_CREDIT" || (payment.method === "CREDIT" && installments > 1);
      if (isCreditSale) {
        if (!sale.customerId) {
          throw new BusinessRuleError("Venda a prazo exige cliente identificado.");
        }
        const parcels = splitInstallments(amount, installments);
        for (let i = 0; i < parcels.length; i++) {
          await tx.insert(receivables).values({
            customerId: sale.customerId,
            saleId: sale.id,
            salePaymentId: inserted.id,
            source: "SALE",
            description: `Venda #${sale.number} — parcela ${i + 1}/${parcels.length}`,
            installmentNumber: i + 1,
            installmentTotal: parcels.length,
            amount: parcels[i],
            dueDate: i === 0
              ? payment.firstDueDate || addDaysKey(todayKey(), 30)
              : addMonthsKey(payment.firstDueDate || todayKey(), i),
            status: "PENDING",
            createdBy: params.actor.id,
          });
        }
      } else if (openSession[0]) {
        await tx.insert(cashMovements).values({
          sessionId: openSession[0].id,
          type: "SALE",
          method: payment.method,
          amount,
          description: `Venda #${sale.number}`,
          referenceType: "SALE",
          referenceId: sale.id,
          userId: params.actor.id,
          userName: params.actor.name,
        });
      }
    }

    const [updated] = await tx
      .update(sales)
      .set({
        status: "COMPLETED",
        paidAmount: paidInfo.paid,
        changeAmount: paidInfo.change,
        profit: preview.profit,
        cashSessionId: openSession[0]?.id ?? sale.cashSessionId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sales.id, sale.id))
      .returning();

    if (openSession[0]) {
      await tx.execute(sql`
        UPDATE cash_sessions SET sales_total = sales_total + ${sale.total}::numeric
        WHERE id = ${openSession[0].id}
      `);
    }

    await writeAudit({
      userId: params.actor.id,
      userName: params.actor.name,
      action: "SALE_FINALIZE",
      entity: "sale",
      entityId: sale.id,
      description: `Venda em aberto #${sale.number} finalizada`,
    });

    return { sale: updated, change: paidInfo.change };
  });
}

export type SalePaymentRow = typeof SalePaymentsTable.$inferSelect;
