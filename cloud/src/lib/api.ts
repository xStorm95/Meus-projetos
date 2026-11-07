/** Respostas padronizadas da API. */
import { NextResponse } from "next/server";

export type ApiError = { error: string; fields?: Record<string, string> };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ error: message, fields } as ApiError, { status });
}

export const unauthorized = () => fail("Sessão expirada. Entre novamente.", 401);
export const tooMany = (message: string) => fail(message, 429);
