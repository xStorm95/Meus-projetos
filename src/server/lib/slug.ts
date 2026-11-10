/**
 * Slugs de loja — usados para identificar a loja na URL e em relatórios.
 * Nunca colide: se já existir, acrescenta um sufixo numérico.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { companies } from "../db/schema";

/** "Passarela da Moda" -> "passarela-da-moda" */
export function slugifyStore(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "minha-loja"
  );
}

/**
 * Slug livre para uma loja nova. `db` pode ser o executor da transação.
 */
export async function uniqueSlug(
  name: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<string> {
  const base = slugifyStore(name);
  let candidate = base;
  for (let i = 2; i <= 50; i++) {
    const taken = await executor
      .select({ id: companies.id })
      .from(companies)
      .where(sql`${companies.slug} = ${candidate}`)
      .limit(1);
    if (!taken[0]) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
