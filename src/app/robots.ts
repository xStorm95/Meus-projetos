import type { MetadataRoute } from "next";

/**
 * robots.txt — o público pode ser indexado; a área logada e as APIs não.
 * (As páginas logadas também mandam `noindex` no metadata, em dois níveis.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/cadastro", "/termos", "/privacidade"],
        disallow: [
          "/dashboard",
          "/pdv",
          "/vendas",
          "/produtos",
          "/estoque",
          "/clientes",
          "/fornecedores",
          "/compras",
          "/financeiro",
          "/crediario",
          "/relatorios",
          "/fiscal",
          "/usuarios",
          "/configuracoes",
          "/auditoria",
          "/perfil",
          "/login",
          "/api/",
        ],
      },
    ],
    sitemap: "/sitemap.xml",
  };
}
