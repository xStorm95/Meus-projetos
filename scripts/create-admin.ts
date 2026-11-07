/**
 * Cria (ou redefine) o usuário administrador inicial de forma segura.
 *
 * - A senha é solicitada interativamente e confirmada; NUNCA há senha padrão.
 * - Em ambientes sem terminal (CI/docker), é possível usar as variáveis
 *   ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD.
 * - Exige AUTH_SECRET configurado e banco já migrado.
 */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { eq, sql } from "drizzle-orm";
import "dotenv/config";
import { db, getPool } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { hashPassword, validatePasswordStrength } from "../src/server/auth/password";
import { writeAudit } from "../src/server/lib/audit";

async function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (!hidden) {
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  return new Promise((resolve) => {
    let value = "";
    stdout.write(question);
    const onData = (char: Buffer) => {
      const s = char.toString();
      if (s === "\n" || s === "\r" || s === "\u0004") {
        stdin.removeListener("data", onData);
        stdout.write("\n");
        rl.close();
        resolve(value.trim());
        return;
      }
      if (s === "\u0003") {
        stdout.write("\n");
        process.exit(1);
      }
      if (s === "\u007f" || s === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      value += s;
      stdout.write("*");
    };
    stdin.on("data", onData);
  });
}

async function main() {
  console.log("\n\x1b[36mPASSARELA ERP\x1b[0m — criação do administrador inicial\n");

  const email = process.env.ADMIN_EMAIL ?? (await ask("E-mail do administrador: ")).toLowerCase();
  const name = process.env.ADMIN_NAME ?? (await ask("Nome completo: "));
  let password = process.env.ADMIN_PASSWORD ?? "";

  if (!password) {
    password = await ask("Senha (mínimo 8 caracteres, letras e números): ", true);
    const confirm = await ask("Confirme a senha: ", true);
    if (password !== confirm) {
      console.error("\n\x1b[31mAs senhas não coincidem.\x1b[0m");
      process.exit(1);
    }
  }

  if (!email || !email.includes("@")) {
    console.error("\x1b[31mE-mail inválido.\x1b[0m");
    process.exit(1);
  }
  const strength = validatePasswordStrength(password);
  if (strength) {
    console.error(`\x1b[31m${strength}\x1b[0m`);
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const passwordHash = await hashPassword(password);

  if (existing[0]) {
    await db
      .update(users)
      .set({ passwordHash, isActive: true, role: "ADMIN", mustChangePassword: false, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id));
    console.log(`\n\x1b[33mUsuário existente atualizado:\x1b[0m ${email} (senha redefinida, perfil Administrador).`);
    await writeAudit({
      userId: existing[0].id,
      userName: existing[0].name,
      action: "ADMIN_PASSWORD_RESET",
      entity: "user",
      entityId: existing[0].id,
      description: "Senha do administrador redefinida via CLI",
    });
  } else {
    const [created] = await db
      .insert(users)
      .values({
        name: name || "Administrador",
        email,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      })
      .returning();
    console.log(`\n\x1b[32mAdministrador criado com sucesso:\x1b[0m ${created.email}`);
    await writeAudit({
      userId: created.id,
      userName: created.name,
      action: "ADMIN_CREATE",
      entity: "user",
      entityId: created.id,
      description: "Administrador inicial criado via CLI",
    });
  }

  console.log("\nAcesse o sistema e faça login. Troque a senha periodicamente.\n");
  await getPool().end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n\x1b[31mFalha ao criar administrador:\x1b[0m", err instanceof Error ? err.message : err);
  process.exit(1);
});
