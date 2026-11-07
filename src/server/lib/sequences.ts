/**
 * Sequências atômicas para numeração de documentos (vendas, orçamentos,
 * devoluções, compras, caixas). Usa UPDATE ... RETURNING dentro de
 * transação para garantir unicidade sob concorrência.
 */
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function nextSequence(tx: Executor, key: string): Promise<number> {
  const result = await tx.execute(sql`
    INSERT INTO sequences (key, value, updated_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1, updated_at = now()
    RETURNING value
  `);
  const rows = result.rows as Array<{ value: number }>;
  return Number(rows[0]?.value ?? 1);
}

export async function formatCode(prefix: string, value: number, width = 6): Promise<string> {
  return `${prefix}${String(value).padStart(width, "0")}`;
}
