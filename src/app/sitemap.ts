import type { MetadataRoute } from "next";

/**
 * Sitemap: apenas as páginas públicas. O domínio de produção vem de APP_URL
 * (se não estiver definido, cai no localhost de desenvolvimento — melhor que
 * inventar uma URL fixa no código).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const agora = new Date();
  return [
    { url: `${base}/`, lastModified: agora, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/cadastro`, lastModified: agora, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/termos`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacidade`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
  ];
}
