import type { Permission } from "@/server/auth/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon:
    | "dashboard"
    | "pos"
    | "sales"
    | "products"
    | "stock"
    | "customers"
    | "suppliers"
    | "purchases"
    | "quotes"
    | "returns"
    | "cash"
    | "finance"
    | "credit"
    | "reports"
    | "fiscal"
    | "users"
    | "settings"
    | "audit";
  permission?: Permission;
  shortcut?: string;
  badge?: "cash";
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAVIGATION: NavGroup[] = [
  {
    title: "Operação",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "sales.view", shortcut: "D" },
      { label: "Nova Venda (PDV)", href: "/pdv", icon: "pos", permission: "sales.create", shortcut: "F2" },
      { label: "Vendas", href: "/vendas", icon: "sales", permission: "sales.view" },
      { label: "Orçamentos", href: "/orcamentos", icon: "quotes", permission: "quotes.view" },
      { label: "Trocas e Devoluções", href: "/trocas", icon: "returns", permission: "returns.view" },
      { label: "Caixa", href: "/caixa", icon: "cash", permission: "cash.view", badge: "cash" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { label: "Produtos", href: "/produtos", icon: "products", permission: "products.view", shortcut: "P" },
      { label: "Estoque", href: "/estoque", icon: "stock", permission: "stock.view" },
      { label: "Clientes", href: "/clientes", icon: "customers", permission: "customers.view" },
      { label: "Fornecedores", href: "/fornecedores", icon: "suppliers", permission: "suppliers.view" },
      { label: "Compras", href: "/compras", icon: "purchases", permission: "purchases.view" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Visão Geral", href: "/financeiro", icon: "finance", permission: "finance.view" },
      { label: "Contas a Pagar", href: "/financeiro/contas-a-pagar", icon: "finance", permission: "finance.view" },
      { label: "Contas a Receber", href: "/financeiro/contas-a-receber", icon: "finance", permission: "finance.view" },
      { label: "DRE Gerencial", href: "/financeiro/dre", icon: "reports", permission: "finance.reports" },
      { label: "Crediário", href: "/crediario", icon: "credit", permission: "credit.view" },
    ],
  },
  {
    title: "Análise",
    items: [
      { label: "Relatórios", href: "/relatorios", icon: "reports", permission: "reports.view" },
      { label: "Fiscal", href: "/fiscal", icon: "fiscal", permission: "fiscal.view" },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Usuários e Permissões", href: "/usuarios", icon: "users", permission: "users.view" },
      { label: "Configurações", href: "/configuracoes", icon: "settings", permission: "settings.view" },
      { label: "Auditoria", href: "/auditoria", icon: "audit", permission: "audit.view" },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAVIGATION.flatMap((g) => g.items);
  // Mais específico primeiro
  return all
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
