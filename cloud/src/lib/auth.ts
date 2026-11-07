/**
 * Segurança de conta: hash de senha (scrypt), tokens de sessão e regras de
 * bloqueio. Sem dependências externas além do Node.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

export const SESSION_COOKIE = "conta_session";
export const SESSION_HOURS = 24;
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/** scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: 128 * Number(nStr) * Number(rStr) * 2,
    });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Token opaco de 32 bytes; no banco guardamos apenas o SHA-256. */
export function createToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_HOURS * 3600 * 1000);
}

export function lockUntil(from = new Date()): Date {
  return new Date(from.getTime() + LOCK_MINUTES * 60 * 1000);
}

export function isLocked(lockedUntil: Date | null | undefined, now = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function minutesLeft(lockedUntil: Date | null | undefined, now = new Date()): number {
  if (!lockedUntil) return 0;
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
}
