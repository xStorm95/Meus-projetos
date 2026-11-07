/**
 * Hash de senhas com scrypt (Node crypto nativo, sem dependências externas).
 * Formato armazenado: scrypt$N$r$p$salt_b64$hash_b64
 * - Parâmetros de custo elevados o suficiente para inviabilizar força bruta.
 * - Comparação em tempo constante para evitar timing attacks.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const N = 32768; // custo de CPU/memória (2^15)
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
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

/** Política mínima de senha. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password)) return "A senha deve conter ao menos uma letra.";
  if (!/[0-9]/.test(password)) return "A senha deve conter ao menos um número.";
  if (["12345678", "senha123", "password", "admin123", "passarela"].includes(password.toLowerCase()))
    return "Esta senha é muito comum. Escolha outra.";
  return null;
}
