/**
 * Validações compartilhadas entre servidor e cliente (funções puras).
 * O mesmo código roda na API e na interface, garantindo mensagens iguais.
 */

export function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  if (email.length < 5 || email.length > 254 || /\s/.test(email)) return false;
  return /^[^\s@]+@[^\s@.]*(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(email);
}

export function normalizeName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isValidName(value: unknown): boolean {
  const name = normalizeName(value);
  return name.length >= 3 && name.length <= 80 && /[A-Za-zÀ-ÿ]/.test(name);
}

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "senha123", "password", "password1",
  "admin123", "qwerty123", "passarela", "palco123", "abcd1234", "11111111",
]);

export function validatePasswordStrength(password: unknown): string | null {
  const p = String(password ?? "");
  if (p.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (p.length > 128) return "A senha pode ter no máximo 128 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(p)) return "Inclua pelo menos uma letra.";
  if (!/\d/.test(p)) return "Inclua pelo menos um número.";
  if (COMMON.has(p.toLowerCase())) return "Essa senha é muito comum. Escolha outra.";
  if (/^(.)\1+$/.test(p)) return "Não use o mesmo caractere repetido.";
  return null;
}

export function passwordScore(password: unknown): number {
  const p = String(password ?? "");
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) && /[^\w\s]/.test(p)) score++;
  return Math.min(4, score);
}

export function passwordLabel(score: number): string {
  return ["Muito fraca", "Fraca", "Média", "Boa", "Forte"][Math.min(4, Math.max(0, score))];
}

export function isValidCPF(value: unknown): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function formatCPF(value: unknown): string {
  const v = onlyDigits(value).slice(0, 11);
  return v
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function formatPhone(value: unknown): string {
  const v = onlyDigits(value).slice(0, 11);
  if (v.length <= 10) return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function isValidPhone(value: unknown): boolean {
  const digits = onlyDigits(value);
  if (!digits) return true;
  return digits.length === 10 || digits.length === 11;
}

export type FieldErrors = Record<string, string>;

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone?: string;
  document?: string;
  birthDate?: string;
  city?: string;
};

export function validateSignup(payload: SignupInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidName(payload.name)) errors.name = "Informe seu nome completo (mínimo 3 letras).";
  if (!isValidEmail(payload.email)) errors.email = "Digite um e-mail válido, como nome@email.com.";
  const passwordError = validatePasswordStrength(payload.password);
  if (passwordError) errors.password = passwordError;
  if (!payload.passwordConfirm || payload.password !== payload.passwordConfirm) {
    errors.passwordConfirm = "As duas senhas precisam ser iguais.";
  }
  if (payload.document && onlyDigits(payload.document) && !isValidCPF(payload.document)) {
    errors.document = "CPF inválido — confira os números.";
  }
  if (!isValidPhone(payload.phone)) errors.phone = "Telefone incompleto: use DDD + número.";
  if (payload.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(payload.birthDate)) {
    errors.birthDate = "Data de nascimento inválida.";
  }
  return errors;
}

export function validateLogin(payload: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidEmail(payload.email)) errors.email = "Digite o e-mail da sua conta.";
  if (!payload.password) errors.password = "Digite sua senha.";
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function initials(name: string): string {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Aceita apenas data URLs de imagem já redimensionadas pelo cliente. */
export function isAcceptableAvatar(dataUrl: unknown): boolean {
  const value = String(dataUrl ?? "");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(value)) return false;
  // ~700 KB de base64 ≈ 520 KB de imagem
  return value.length <= 700 * 1024;
}
