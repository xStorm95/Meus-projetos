/** Chamadas à API do lado do navegador. */
export type AccountDTO = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  document: string | null;
  birthDate: string | null;
  city: string | null;
  bio: string | null;
  avatar: string | null;
  avatarUpdatedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type SessionDTO = { createdAt: string; expiresAt: string; userAgent: string | null; id?: string; ip?: string | null };

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string>; status: number };

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
      cache: "no-store",
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body.error ?? "Não conseguimos concluir agora.",
        fields: body.fields,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "Sem conexão com o servidor. Verifique sua internet." };
  }
}

/** Redimensiona e comprime a foto no navegador antes de enviar. */
export function compressImage(file: File, max = 512, quality = 0.88): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error("Escolha uma imagem JPG, PNG ou WEBP."));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error("A imagem tem mais de 15 MB. Escolha uma menor."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não conseguimos ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(iso);
}

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = String(userAgent ?? "");
  if (!ua) return "Dispositivo desconhecido";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Outro";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Navegador";
  return `${browser} · ${os}`;
}
