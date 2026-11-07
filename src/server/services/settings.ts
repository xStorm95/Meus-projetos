/**
 * Configurações da empresa — registro único (id='default').
 * Nome do sistema, dados da loja, regras de desconto/estoque/crédito,
 * parâmetros fiscais e de impressão são lidos daqui.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";

export type AppSettings = typeof settings.$inferSelect;

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(eq(settings.id, "default")).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(settings)
    .values({ id: "default" })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db.select().from(settings).where(eq(settings.id, "default")).limit(1);
  return again[0];
}

/** Cache em memória curto para evitar leitura a cada requisição. */
let cache: { value: AppSettings; at: number } | null = null;
const TTL = 15_000;

export async function getSettingsCached(): Promise<AppSettings> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return cache.value;
  const value = await getSettings();
  cache = { value, at: now };
  return value;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  await getSettings();
  const { id: _ignored, updatedAt: _ignored2, ...rest } = patch;
  const rows = await db
    .update(settings)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(settings.id, "default"))
    .returning();
  invalidateSettingsCache();
  return rows[0];
}
