"use client";

/**
 * Cliente HTTP tipado. Centraliza tratamento de erros e mensagens
 * compreensíveis para o usuário.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: Array<{ field: string; message: string }>;
  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details as Array<{ field: string; message: string }> | undefined;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin",
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const body = data as { error?: string; code?: string; details?: unknown } | null;
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(
      body?.error ?? `Erro ${res.status} ao processar a solicitação.`,
      res.status,
      body?.code ?? "ERROR",
      body?.details,
    );
  }

  return data as T;
}

export const api = {
  get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const search = params
      ? new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .flatMap(([k, v]) =>
              Array.isArray(v) ? v.map((item) => [k, String(item)]) : [[k, String(v)]],
            ),
        ).toString()
      : "";
    return request<T>(`${path}${search ? `?${search}` : ""}`);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
  },
  delete<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "DELETE", body: JSON.stringify(body ?? {}) });
  },
};

/** Mensagem amigável de erro. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.length) {
      return `${err.message} (${err.details[0].field}: ${err.details[0].message})`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Ocorreu um erro inesperado. Tente novamente.";
}

/** Download de arquivos gerados no servidor (CSV/Excel/JSON). */
export async function downloadFile(path: string, params?: Record<string, unknown>, fallbackName?: string) {
  const search = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(`${path}${search ? `?${search}` : ""}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? "Falha ao gerar o arquivo.", res.status, body?.code ?? "ERROR");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : (fallbackName ?? "download");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
