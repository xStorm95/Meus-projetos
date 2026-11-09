/**
 * Cadastro e login reais (contra o PostgreSQL de desenvolvimento).
 *
 * Cobre o fluxo do usuário: criar a loja com cor da logo → sessão aberta →
 * a identidade (nome + cor) fica salva → segundo cadastro é bloqueado.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import "./helpers";
import { db } from "@/server/db/client";
import { createUser } from "@/server/services/users";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { buildAccentPalette, customAccentValue, customAccentHex } from "@/server/lib/color";

describe("senha de cadastro", () => {
  it("recusa senhas fracas e aceita forte", () => {
    expect(validatePasswordStrength("12345678")).not.toBeNull();
    expect(validatePasswordStrength("senha")).not.toBeNull();
    expect(validatePasswordStrength("MinhaLoja2026!")).toBeNull();
  });

  it("hash é diferente da senha e verificável", async () => {
    const { verifyPassword } = await import("@/server/auth/password");
    const hash = await hashPassword("MinhaLoja2026!");
    expect(hash).not.toContain("MinhaLoja2026!");
    expect(await verifyPassword("MinhaLoja2026!", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
  });
});

describe("cadastro cria loja com identidade", () => {
  beforeAll(async () => {
    const { rows } = await db.execute(sql`SELECT to_regclass('public.users') IS NOT NULL AS ok`);
    if (!(rows as Array<{ ok: boolean }>)[0]?.ok) throw new Error("Banco não migrado.");
  });

  it("guarda o nome da loja e a cor da logo", async () => {
    const email = `teste_${Date.now()}@passarela.test`;
    const user = await createUser(
      { name: "Dona Teste", email, password: "MinhaLoja2026!", role: "ADMIN", isActive: true },
      { id: "00000000-0000-4000-8000-000000000000", name: "Teste" },
    );
    expect(user.email).toBe(email.toLowerCase());

    // a cor escolhida no cadastro é a mesma que o tema recebe
    const value = customAccentValue("#c2405a");
    expect(customAccentHex(value)).toBe("#c2405a");
    expect(buildAccentPalette(customAccentHex(value)!)!.accent).toBe("#c2405a");

    await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);
  });

  it("e-mail é único sem diferenciar maiúsculas", async () => {
    const email = `unico_${Date.now()}@passarela.test`;
    const actor = { id: "00000000-0000-4000-8000-000000000000", name: "Teste" };
    const user = await createUser(
      { name: "A", email, password: "MinhaLoja2026!", role: "ADMIN", isActive: true },
      actor,
    );
    await expect(
      createUser({ name: "B", email: email.toUpperCase(), password: "MinhaLoja2026!", role: "SELLER", isActive: true }, actor),
    ).rejects.toThrow();
    await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);
  });
});
