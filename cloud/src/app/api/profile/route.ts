import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { fail, ok, unauthorized } from "@/lib/api";
import { getSession, toSessionAccount } from "@/lib/session";
import { isValidCPF, isValidEmail, isValidName, isValidPhone, normalizeEmail, normalizeName, onlyDigits } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return ok({ account: session.account });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Dados inválidos.");
  }

  const fields: Record<string, string> = {};
  const current = session.account;

  const name = body.name === undefined ? current.name : normalizeName(body.name);
  if (!isValidName(name)) fields.name = "Informe seu nome completo.";

  const emailRaw = body.email === undefined ? current.email : String(body.email);
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) fields.email = "E-mail inválido.";

  const document = body.document === undefined ? current.document ?? "" : onlyDigits(body.document);
  if (document && !isValidCPF(document)) fields.document = "CPF inválido.";

  const phone = body.phone === undefined ? current.phone ?? "" : onlyDigits(body.phone);
  if (!isValidPhone(phone)) fields.phone = "Telefone incompleto.";

  const birthDate = body.birthDate === undefined ? current.birthDate ?? "" : String(body.birthDate);
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) fields.birthDate = "Data inválida.";

  const bio = body.bio === undefined ? current.bio ?? "" : String(body.bio).slice(0, 300);
  const city = body.city === undefined ? current.city ?? "" : normalizeName(body.city);

  if (Object.keys(fields).length) return fail("Confira os campos destacados.", 422, fields);

  try {
    if (email !== normalizeEmail(current.email)) {
      const taken = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.emailNormalized, email), ne(accounts.id, current.id)))
        .limit(1);
      if (taken.length) {
        return fail("Este e-mail já pertence a outra conta.", 409, { email: "Este e-mail já pertence a outra conta." });
      }
    }

    const [updated] = await db
      .update(accounts)
      .set({
        name,
        email: emailRaw.trim(),
        emailNormalized: email,
        document: document || null,
        phone: phone || null,
        birthDate: birthDate || null,
        city: city || null,
        bio: bio || null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, current.id))
      .returning();

    return ok({ account: toSessionAccount(updated) });
  } catch (err) {
    const message = (err as Error).message;
    if (/accounts_email_idx|duplicate key/.test(message)) {
      return fail("Este e-mail já pertence a outra conta.", 409, { email: "E-mail já usado." });
    }
    console.error("[profile]", message);
    return fail("Não conseguimos salvar agora. Tente novamente.", 500);
  }
}
