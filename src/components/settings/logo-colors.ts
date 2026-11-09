/**
 * Paleta de cores a partir de uma imagem (a logo).
 *
 * Roda no NAVEGADOR, sem backend: desenha a imagem num canvas pequeno,
 * agrupa os pixels por cor, ignora fundo/branco/preto e devolve as
 * cores dominantes ordenadas por presença — prontas para virar a cor
 * do site com um clique.
 *
 * Tudo local: a imagem nunca sai do computador do usuário.
 */

export interface ExtractedColor {
  hex: string;
  /** 0..1 — quanto da imagem essa cor ocupa (sem contar fundo). */
  weight: number;
  /** true quando a cor é escura o bastante para combinar com texto claro. */
  dark: boolean;
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** Distância simples entre cores (0..441) para agrupar tons parecidos. */
function distance(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Extrai até `limit` cores da imagem.
 * Imagens grandes são reduzidas antes da leitura para não travar a tela.
 */
export async function extractLogoColors(
  source: string | File | Blob,
  limit = 6,
): Promise<ExtractedColor[]> {
  const bitmap = await loadImage(source);
  const size = 96; // amostragem pequena: rápido e suficiente para achar a cor
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets: Array<{ rgb: number[]; count: number }> = [];
  let considered = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 180) continue; // transparente
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { s, l } = rgbToHsl(r, g, b);
    // Fundo (branco/quase branco) e texto preto não representam a marca.
    if (l > 0.95 || l < 0.06) continue;
    // Cinzas muito dessaturados também não ajudam como cor de destaque.
    if (s < 0.07) continue;
    considered++;
    let merged = false;
    for (const bucket of buckets) {
      if (distance(bucket.rgb, [r, g, b]) < 42) {
        bucket.rgb = [
          (bucket.rgb[0] * bucket.count + r) / (bucket.count + 1),
          (bucket.rgb[1] * bucket.count + g) / (bucket.count + 1),
          (bucket.rgb[2] * bucket.count + b) / (bucket.count + 1),
        ];
        bucket.count++;
        merged = true;
        break;
      }
    }
    if (!merged) buckets.push({ rgb: [r, g, b], count: 1 });
  }

  const total = Math.max(1, considered);
  return buckets
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((bucket) => {
      const [r, g, b] = bucket.rgb.map((v) => Math.round(v));
      const { l } = rgbToHsl(r, g, b);
      return { hex: toHex(r, g, b), weight: bucket.count / total, dark: l < 0.45 };
    });
}

function loadImage(source: string | File | Blob): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    img.onload = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem da logo."));
    };
    img.src = url;
  });
}
