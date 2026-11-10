/**
 * Configurações da empresa — UMA linha por loja (id = id da loja).
 * Nome do sistema, dados da loja, regras de desconto/estoque/crédito,
 * parâmetros fiscais e de impressão são lidos daqui.
 *
 * Multi-loja: cada loja tem o seu registro. As funções recebem o id da loja;
 * quando não recebem, usam a sessão atual (nunca um "default" global).
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";

export type AppSettings = typeof settings.$inferSelect;

/** Id do registro de configurações de uma loja. */
export function settingsIdFor(companyId: string): string {
  return companyId;
}

export async function getSettingsFor(companyId: string): Promise<AppSettings> {
  // Garante o contexto da loja mesmo quando chamado de fora de uma requisição
  // (ex.: cadastro, script de provisionamento).
  const { withCompany } = await import("../db/tenant");
  return withCompany(companyId, () => getSettingsForUnsafe(companyId));
}

async function getSettingsForUnsafe(companyId: string): Promise<AppSettings> {
  const id = settingsIdFor(companyId);
  const rows = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(settings)
    .values({ id, companyId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
  return again[0];
}

export async function getSettings(): Promise<AppSettings> {
  const { currentCompanyId } = await import("../db/tenant");
  return getSettingsFor(await currentCompanyId());
}

/** Cache em memória curto por loja, para evitar leitura a cada requisição. */
const cache = new Map<string, { value: AppSettings; at: number }>();
const TTL = 15_000;

export async function getSettingsCached(): Promise<AppSettings> {
  const { currentCompanyId } = await import("../db/tenant");
  const companyId = await currentCompanyId();
  const now = Date.now();
  const hit = cache.get(companyId);
  if (hit && now - hit.at < TTL) return hit.value;
  const value = await getSettingsFor(companyId);
  cache.set(companyId, { value, at: now });
  return value;
}

export function invalidateSettingsCache(companyId?: string) {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const { currentCompanyId, withCompany } = await import("../db/tenant");
  const companyId = patch.companyId ?? (await currentCompanyId());
  return withCompany(companyId, () => updateSettingsUnsafe(companyId, patch));
}

async function updateSettingsUnsafe(
  companyId: string,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const id = settingsIdFor(companyId);
  await getSettingsForUnsafe(companyId);
  const { id: _ignored, updatedAt: _ignored2, companyId: _ignored3, ...rest } = patch;
  const rows = await db
    .update(settings)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(settings.id, id))
    .returning();
  invalidateSettingsCache(companyId);
  return rows[0];
}
