import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { withSchema } from "@/db/guard";
import { fail, ok } from "@/lib/api";
import { startSession, toSessionAccount } from "@/lib/session";
import { hasErrors, normalizeEmail, normalizeName, onlyDigits, validateSignup } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Não conseguimos ler os dados enviados.");
  }

  const payload = {
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    passwordConfirm: String(body.passwordConfirm ?? ""),
    phone: body.phone ? String(body.phone) : "",
    document: body.document ? String(body.document) : "",
    birthDate: body.birthDate ? String(body.birthDate) : "",
    city: body.city ? String(body.city) : "",
  };

  const errors = validateSignup(payload);
  if (hasErrors(errors)) return fail("Confira os campos destacados.", 422, errors);

  const email = normalizeEmail(payload.email);

  try {
    return await withSchema(async () => {
      const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.emailNormalized, email)).limit(1);
      if (existing.length) {
        return fail("Este e-mail já tem conta. Faça login.", 409, { email: "Este e-mail já tem conta. Faça login." });
      }

      const total = await db.select({ id: accounts.id }).from(accounts).limit(1);
      const [created] = await db
        .insert(accounts)
        .values({
          name: normalizeName(payload.name),
          email: payload.email.trim(),
          emailNormalized: email,
          passwordHash: await hashPassword(payload.password),
          role: total.length === 0 ? "owner" : "member",
          phone: payload.phone ? onlyDigits(payload.phone) : null,
          document: payload.document ? onlyDigits(payload.document) : null,
          birthDate: payload.birthDate || null,
          city: payload.city ? normalizeName(payload.city) : null,
          lastLoginAt: new Date(),
        })
        .returning();

      await startSession(created.id, request);
      return ok({ account: toSessionAccount(created) }, { status: 201 });
    });
  } catch (err) {
    const message = (err as Error).message;
    if (/accounts_email_idx|duplicate key/.test(message)) {
      return fail("Este e-mail já tem conta. Faça login.", 409, { email: "Este e-mail já tem conta." });
    }
    console.error("[signup]", message);
    return fail("Não conseguimos criar a conta agora. Tente novamente em instantes.", 500);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "signup" });
}
