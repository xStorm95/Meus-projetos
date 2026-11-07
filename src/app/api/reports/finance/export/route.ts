import { z } from "zod";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { apiHandler } from "@/server/lib/api";
import { csvResponse, csvDate, csvNumber, jsonResponse } from "@/server/lib/export";
import { db } from "@/server/db/client";
import {
  customers,
  financeCategories,
  financeEntries,
  payables,
  receivables,
  suppliers,
} from "@/server/db/schema";
import { dre, cashFlow } from "@/server/services/finance";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  kind: z.enum(["payables", "receivables", "dre", "cashflow", "entries"]).default("payables"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().optional(),
});

export const GET = apiHandler(
  { permission: ["reports.export", "finance.reports"], query: querySchema },
  async ({ query }) => {
    const stamp = `${query.from}_${query.to}`;

    if (query.kind === "payables") {
      const conds = [gte(payables.dueDate, query.from), lte(payables.dueDate, query.to)];
      if (query.status && query.status !== "ALL") conds.push(eq(payables.status, query.status as never));
      const rows = await db
        .select({
          dueDate: payables.dueDate,
          description: payables.description,
          supplier: suppliers.legalName,
          category: financeCategories.name,
          document: payables.documentNumber,
          installmentNumber: payables.installmentNumber,
          installmentTotal: payables.installmentTotal,
          amount: payables.amount,
          paidAmount: payables.paidAmount,
          status: payables.status,
        })
        .from(payables)
        .leftJoin(suppliers, eq(suppliers.id, payables.supplierId))
        .leftJoin(financeCategories, eq(financeCategories.id, payables.categoryId))
        .where(and(...conds))
        .orderBy(asc(payables.dueDate));

      if (query.format === "json") return jsonResponse(`contas-a-pagar_${stamp}.json`, rows);
      return csvResponse(
        `contas-a-pagar_${stamp}.csv`,
        ["Vencimento", "Descrição", "Fornecedor", "Categoria", "Documento", "Parcela", "Valor", "Pago", "Saldo", "Situação"],
        rows.map((r) => [
          csvDate(r.dueDate),
          r.description,
          r.supplier ?? "",
          r.category ?? "",
          r.document ?? "",
          r.installmentTotal ? `${r.installmentNumber}/${r.installmentTotal}` : "",
          csvNumber(r.amount),
          csvNumber(r.paidAmount),
          csvNumber(Number(r.amount) - Number(r.paidAmount)),
          r.status,
        ]),
      );
    }

    if (query.kind === "receivables") {
      const conds = [gte(receivables.dueDate, query.from), lte(receivables.dueDate, query.to)];
      if (query.status && query.status !== "ALL") conds.push(eq(receivables.status, query.status as never));
      const rows = await db
        .select({
          dueDate: receivables.dueDate,
          customer: customers.name,
          phone: customers.phone,
          description: receivables.description,
          installmentNumber: receivables.installmentNumber,
          installmentTotal: receivables.installmentTotal,
          amount: receivables.amount,
          paidAmount: receivables.paidAmount,
          penalty: receivables.penaltyAmount,
          interest: receivables.interestAmount,
          status: receivables.status,
        })
        .from(receivables)
        .leftJoin(customers, eq(customers.id, receivables.customerId))
        .where(and(...conds))
        .orderBy(asc(receivables.dueDate));

      if (query.format === "json") return jsonResponse(`contas-a-receber_${stamp}.json`, rows);
      return csvResponse(
        `contas-a-receber_${stamp}.csv`,
        ["Vencimento", "Cliente", "Telefone", "Descrição", "Parcela", "Valor", "Recebido", "Multa", "Juros", "Saldo", "Situação"],
        rows.map((r) => [
          csvDate(r.dueDate),
          r.customer ?? "Consumidor final",
          r.phone ?? "",
          r.description ?? "",
          r.installmentTotal ? `${r.installmentNumber}/${r.installmentTotal}` : "",
          csvNumber(r.amount),
          csvNumber(r.paidAmount),
          csvNumber(r.penalty),
          csvNumber(r.interest),
          csvNumber(Number(r.amount) - Number(r.paidAmount)),
          r.status,
        ]),
      );
    }

    if (query.kind === "entries") {
      const rows = await db
        .select({
          paidAt: financeEntries.paidAt,
          kind: financeEntries.kind,
          amount: financeEntries.amount,
          method: financeEntries.method,
          userName: financeEntries.userName,
          notes: financeEntries.notes,
        })
        .from(financeEntries)
        .where(
          and(
            gte(financeEntries.paidAt, new Date(`${query.from}T00:00:00Z`)),
            lte(financeEntries.paidAt, new Date(`${query.to}T23:59:59Z`)),
          ),
        )
        .orderBy(desc(financeEntries.paidAt));

      if (query.format === "json") return jsonResponse(`lancamentos_${stamp}.json`, rows);
      return csvResponse(
        `lancamentos_${stamp}.csv`,
        ["Data", "Tipo", "Valor", "Forma", "Responsável", "Observações"],
        rows.map((r) => [
          csvDate(r.paidAt),
          r.kind === "PAYMENT" ? "Pagamento" : "Recebimento",
          csvNumber(r.amount),
          r.method,
          r.userName ?? "",
          r.notes ?? "",
        ]),
      );
    }

    if (query.kind === "cashflow") {
      const flow = await cashFlow({ from: query.from, to: query.to });
      if (query.format === "json") return jsonResponse(`fluxo-caixa_${stamp}.json`, flow);
      return csvResponse(
        `fluxo-caixa_${stamp}.csv`,
        ["Indicador", "Valor"],
        Object.entries(flow as unknown as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string" || typeof v === "number")
          .map(([k, v]) => [k, typeof v === "number" ? String(v) : csvNumber(v as string)]),
      );
    }

    // DRE completo
    const data = await dre({ from: query.from, to: query.to });
    if (query.format === "json") return jsonResponse(`dre_${stamp}.json`, data);
    return csvResponse(
      `dre_${stamp}.csv`,
      ["Linha", "Valor"],
      [
        ["Receita bruta", csvNumber(data.grossRevenue)],
        ["(-) Devoluções", csvNumber(data.deductions)],
        ["Receita líquida", csvNumber(data.netRevenue)],
        ["(-) CMV", csvNumber(data.cogs)],
        ["Lucro bruto", csvNumber(data.grossProfit)],
        ["(-) Despesas operacionais", csvNumber(data.operatingExpenses)],
        ["Resultado operacional", csvNumber(data.operatingResult)],
        ["(+) Outras receitas", csvNumber(data.otherIncome)],
        ["(-) Outras despesas", csvNumber(data.otherExpenses)],
        ["Resultado líquido", csvNumber(data.finalResult)],
        ["Margem bruta (%)", data.grossMargin.toFixed(2).replace(".", ",")],
        ["Margem líquida (%)", data.netMargin.toFixed(2).replace(".", ",")],
        ["Vendas concluídas", String(data.salesCount)],
        ["Descontos concedidos", csvNumber(data.discounts)],
      ],
    );
  },
);
