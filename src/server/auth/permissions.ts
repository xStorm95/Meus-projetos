/**
 * Catálogo de permissões e cálculo de permissões efetivas.
 *
 * Modelo: cada usuário possui um PERFIL (role) que concede um conjunto base de
 * permissões. O administrador pode CONCEDER permissões extras ou NEGAR
 * permissões específicas individualmente. A negação sempre prevalece.
 */
export const PERMISSIONS = {
  // Produtos e catálogo
  "products.view": "Visualizar produtos",
  "products.create": "Criar produtos",
  "products.update": "Editar produtos",
  "products.delete": "Excluir/inativar produtos",
  "products.price.update": "Alterar preços de produtos",
  "products.import": "Importar/exportar produtos",
  // Estoque
  "stock.view": "Visualizar estoque e movimentações",
  "stock.adjust": "Ajustar estoque / inventário",
  "stock.transfer": "Transferir entre depósitos",
  "stock.negative.allow": "Permitir estoque negativo",
  // Vendas
  "sales.view": "Visualizar vendas",
  "sales.create": "Realizar vendas",
  "sales.cancel": "Cancelar vendas",
  "sales.discount": "Aplicar descontos",
  "sales.discount.unlimited": "Aplicar descontos acima do limite",
  "sales.view.all": "Ver vendas de todos os vendedores",
  // Caixa
  "cash.view": "Visualizar caixas",
  "cash.open": "Abrir caixa",
  "cash.close": "Fechar caixa",
  "cash.withdraw": "Realizar sangria/reforço",
  // Financeiro
  "finance.view": "Visualizar financeiro",
  "finance.create": "Criar contas a pagar/receber",
  "finance.update": "Editar lançamentos financeiros",
  "finance.delete": "Cancelar lançamentos financeiros",
  "finance.pay": "Efetuar pagamentos/recebimentos",
  "finance.reports": "Acessar DRE e relatórios financeiros",
  // Crediário
  "credit.view": "Visualizar crediário",
  "credit.limit.update": "Alterar limite de crédito",
  "credit.renegotiate": "Renegociar dívidas",
  // Clientes e CRM
  "customers.view": "Visualizar clientes",
  "customers.create": "Cadastrar clientes",
  "customers.update": "Editar clientes",
  "customers.delete": "Excluir clientes (LGPD)",
  "customers.export": "Exportar dados de clientes",
  // Fornecedores e compras
  "suppliers.view": "Visualizar fornecedores",
  "suppliers.manage": "Gerenciar fornecedores",
  "purchases.view": "Visualizar compras",
  "purchases.manage": "Gerenciar pedidos de compra",
  // Orçamentos, trocas e devoluções
  "quotes.view": "Visualizar orçamentos",
  "quotes.manage": "Gerenciar orçamentos",
  "returns.view": "Visualizar trocas e devoluções",
  "returns.create": "Realizar trocas e devoluções",
  // Relatórios
  "reports.view": "Acessar relatórios",
  "reports.export": "Exportar relatórios",
  // Fiscal
  "fiscal.view": "Visualizar documentos fiscais",
  "fiscal.emit": "Emitir documentos fiscais",
  "fiscal.cancel": "Cancelar documentos fiscais",
  "fiscal.configure": "Configurar parâmetros fiscais",
  // Administração
  "users.view": "Visualizar usuários",
  "users.manage": "Gerenciar usuários e permissões",
  "settings.view": "Visualizar configurações",
  "settings.manage": "Alterar configurações",
  "audit.view": "Visualizar auditoria",
  "backup.run": "Executar backup/restauração",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export type UserRole = "ADMIN" | "MANAGER" | "SELLER" | "CASHIER" | "FINANCE" | "STOCK";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  CASHIER: "Caixa",
  FINANCE: "Financeiro",
  STOCK: "Estoquista",
};

const P = <T extends Permission[]>(...keys: T) => keys;

/** Permissões base de cada perfil. */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: P(
    "products.view", "products.create", "products.update", "products.delete",
    "products.price.update", "products.import",
    "stock.view", "stock.adjust", "stock.transfer",
    "sales.view", "sales.create", "sales.cancel", "sales.discount", "sales.view.all",
    "cash.view", "cash.open", "cash.close", "cash.withdraw",
    "finance.view", "finance.create", "finance.update", "finance.pay", "finance.reports",
    "credit.view", "credit.limit.update", "credit.renegotiate",
    "customers.view", "customers.create", "customers.update", "customers.export",
    "suppliers.view", "suppliers.manage", "purchases.view", "purchases.manage",
    "quotes.view", "quotes.manage", "returns.view", "returns.create",
    "reports.view", "reports.export",
    "fiscal.view", "fiscal.emit",
    "users.view", "settings.view",
  ),
  SELLER: P(
    "products.view", "stock.view",
    "sales.view", "sales.create", "sales.discount",
    "customers.view", "customers.create", "customers.update",
    "quotes.view", "quotes.manage",
    "returns.view",
    "credit.view",
    "cash.open",
  ),
  CASHIER: P(
    "products.view", "stock.view",
    "sales.view", "sales.create",
    "cash.view", "cash.open", "cash.close", "cash.withdraw",
    "customers.view", "customers.create",
    "finance.pay",
    "credit.view",
  ),
  FINANCE: P(
    "finance.view", "finance.create", "finance.update", "finance.delete", "finance.pay",
    "finance.reports", "credit.view", "credit.limit.update", "credit.renegotiate",
    "customers.view", "customers.export",
    "suppliers.view",
    "sales.view",
    "reports.view", "reports.export",
    "cash.view",
  ),
  STOCK: P(
    "products.view", "products.create", "products.update", "products.import",
    "stock.view", "stock.adjust", "stock.transfer",
    "suppliers.view", "purchases.view", "purchases.manage",
    "reports.view",
  ),
};

/** Calcula permissões efetivas de um usuário (grant extra - deny). */
export function effectivePermissions(user: {
  role: UserRole;
  extraPermissions?: string[] | null;
  deniedPermissions?: string[] | null;
}): Permission[] {
  const base = new Set<Permission>(ROLE_PERMISSIONS[user.role] ?? []);
  for (const extra of user.extraPermissions ?? []) {
    if (ALL_PERMISSIONS.includes(extra as Permission)) base.add(extra as Permission);
  }
  for (const denied of user.deniedPermissions ?? []) {
    base.delete(denied as Permission);
  }
  // ADMIN não pode ter permissões removidas além das explicitamente negadas,
  // mas garantimos acesso mínimo à administração de usuários para evitar lockout.
  if (user.role === "ADMIN") {
    base.add("users.view");
    base.add("users.manage");
    base.add("settings.view");
    base.add("settings.manage");
  }
  return [...base];
}

/** Limite de desconto permitido ao usuário, em %. */
export function discountLimitFor(role: UserRole, settings: {
  sellerMaxDiscount: string;
  defaultMaxDiscount: string;
}): number {
  if (role === "ADMIN") return 100;
  if (role === "MANAGER") return Number(settings.defaultMaxDiscount);
  return Number(settings.sellerMaxDiscount);
}
