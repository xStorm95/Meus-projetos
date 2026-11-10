/**
 * PASSARELA ERP — Esquema completo do banco de dados (PostgreSQL)
 * ---------------------------------------------------------------
 * Convenções:
 *  - Nomes de tabelas e colunas em snake_case no banco, camelCase no TypeScript.
 *  - Valores monetários em numeric(14,2) — leitura como string para evitar
 *    erros de ponto flutuante (use os helpers de src/server/lib/money.ts).
 *  - Quantidades em numeric(14,3) (permite frações para futuro uso em balanças).
 *  - Datas de negócio em timestamptz; datas "puras" (vencimento, nascimento) em date.
 *  - Soft delete (deleted_at) em entidades que possuem histórico financeiro/fiscal.
 *  - Somente exclusão física para registros sem valor contábil (preferir is_active).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  date,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============================================================
 * TABELAS POR LOJA (multi-loja)
 * ------------------------------------------------------------
 * Toda tabela desta lista tem `company_id` e é filtrada automaticamente
 * pelo driver (ver ./tenant.ts e ./client.ts). Tabela nova de negócio
 * precisa entrar aqui — o teste em tests/tenant.test.ts garante que
 * nenhuma tabela com company_id ficou de fora.
 * ============================================================ */
export const TENANT_TABLES = [
  "users",
  "sessions",
  "password_reset_tokens",
  "audit_logs",
  "settings",
  "categories",
  "brands",
  "colors",
  "sizes",
  "collections",
  "suppliers",
  "products",
  "product_variants",
  "product_kit_items",
  "price_histories",
  "warehouses",
  "stock_levels",
  "stock_movements",
  "stock_counts",
  "stock_count_items",
  "stock_transfers",
  "stock_transfer_items",
  "customers",
  "sales",
  "sale_items",
  "sale_payments",
  "quotes",
  "quote_items",
  "returns",
  "return_items",
  "cash_sessions",
  "cash_movements",
  "finance_categories",
  "cost_centers",
  "bank_accounts",
  "payables",
  "receivables",
  "finance_entries",
  "account_transfers",
  "recurring_entries",
  "credit_renegotiations",
  "customer_credits",
  "purchase_orders",
  "purchase_items",
  "fiscal_documents",
  "notifications",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/* ============================================================
 * ENUMS
 * ============================================================ */
export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "MANAGER",
  "SELLER",
  "CASHIER",
  "FINANCE",
  "STOCK",
]);

export const productStatusEnum = pgEnum("product_status", ["ACTIVE", "INACTIVE"]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "OPENING",
  "PURCHASE",
  "SALE",
  "RETURN",
  "EXCHANGE_IN",
  "EXCHANGE_OUT",
  "ADJUSTMENT",
  "INVENTORY",
  "LOSS",
  "DAMAGE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RESERVATION",
  "RESERVATION_RELEASE",
  "CANCEL_SALE",
]);

export const saleStatusEnum = pgEnum("sale_status", ["OPEN", "COMPLETED", "CANCELED"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "PIX",
  "DEBIT",
  "CREDIT",
  "STORE_CREDIT",
  "TRANSFER",
  "OTHER",
]);
export const receivableStatusEnum = pgEnum("receivable_status", [
  "PENDING",
  "PARTIAL",
  "PAID",
  "OVERDUE",
  "CANCELED",
  "RENEGOTIATED",
]);
export const payableStatusEnum = pgEnum("payable_status", [
  "PENDING",
  "PARTIAL",
  "PAID",
  "CANCELED",
]);
export const cashSessionStatusEnum = pgEnum("cash_session_status", ["OPEN", "CLOSED"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", [
  "OPENING",
  "SALE",
  "RECEIPT",
  "PAYMENT",
  "WITHDRAWAL",
  "SUPPLY",
  "REFUND",
  "CLOSING_ADJUSTMENT",
]);
export const quoteStatusEnum = pgEnum("quote_status", [
  "OPEN",
  "CONVERTED",
  "EXPIRED",
  "CANCELED",
]);
export const returnTypeEnum = pgEnum("return_type", ["EXCHANGE", "RETURN"]);
export const returnActionEnum = pgEnum("return_action", ["RESTOCK", "DAMAGED", "DISCARD"]);
export const refundMethodEnum = pgEnum("refund_method", [
  "CASH",
  "PIX",
  "DEBIT",
  "CREDIT",
  "STORE_CREDIT",
  "EXCHANGE",
  "NONE",
]);
export const purchaseStatusEnum = pgEnum("purchase_status", [
  "DRAFT",
  "QUOTATION",
  "ORDERED",
  "PARTIAL",
  "RECEIVED",
  "CANCELED",
]);
export const financeTypeEnum = pgEnum("finance_type", ["INCOME", "EXPENSE"]);
export const dreGroupEnum = pgEnum("dre_group", [
  "REVENUE",
  "DEDUCTION",
  "COGS",
  "OPERATING_EXPENSE",
  "OTHER_INCOME",
  "OTHER_EXPENSE",
]);
export const fiscalStatusEnum = pgEnum("fiscal_status", [
  "PENDING",
  "AUTHORIZED",
  "REJECTED",
  "CANCELED",
  "SIMULATED",
]);
export const fiscalEnvironmentEnum = pgEnum("fiscal_environment", [
  "HOMOLOGATION",
  "PRODUCTION",
]);
export const notificationSeverityEnum = pgEnum("notification_severity", [
  "INFO",
  "WARNING",
  "DANGER",
  "SUCCESS",
]);
export const accountTypeEnum = pgEnum("account_type", ["CASH", "BANK", "CARD"]);
export const invoiceFrequencyEnum = pgEnum("invoice_frequency", [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);

/* ============================================================
 * USUÁRIOS, PERFIS E SEGURANÇA
 * ============================================================ */
/**
 * LOJAS (multi-loja) — cada cadastro público cria uma loja nova.
 * Todo dado operacional pertence a uma loja e nunca é visível para outra.
 */
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  email: text("email"),
  phone: text("phone"),
  document: text("document"),
  /** Situação da loja: suspender uma loja não apaga os dados dela. */
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Loja à qual o usuário pertence (todo usuário tem exatamente uma). */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("SELLER"),
    /** Permissões individuais que complementam (grant) ou removem (deny) as do perfil */
    extraPermissions: jsonb("extra_permissions").$type<string[]>().notNull().default([]),
    deniedPermissions: jsonb("denied_permissions").$type<string[]>().notNull().default([]),
    phone: text("phone"),
    /** Foto de perfil (data URL) e data de nascimento. */
    avatarUrl: text("avatar_url"),
    birthDate: date("birth_date"),
    commissionRate: numeric("commission_rate", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    monthlyGoal: numeric("monthly_goal", { precision: 14, scale: 2 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_company_email_uq").on(t.companyId, sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Loja da sessão: amarrada no login e conferida em cada requisição. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    uniqueIndex("sessions_token_uq").on(t.tokenHash),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prt_token_uq").on(t.tokenHash)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    description: text("description"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_created_idx").on(t.createdAt),
    index("audit_user_idx").on(t.userId),
  ],
);

/* ============================================================
 * CONFIGURAÇÕES DA EMPRESA (registro único)
 * ============================================================ */
export const settings = pgTable("settings", {
  /** Uma linha de configurações por loja (o id é o id da loja). */
  id: text("id").primaryKey().default("default"),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  appName: text("app_name").notNull().default("PASSARELA ERP"),
  companyName: text("company_name").notNull().default("Minha Loja"),
  companyLegalName: text("company_legal_name"),
  companyDocument: text("company_document"),
  companyStateRegistration: text("company_state_registration"),
  companyCityRegistration: text("company_city_registration"),
  companyAddress: text("company_address"),
  companyAddressNumber: text("company_address_number"),
  companyDistrict: text("company_district"),
  companyCity: text("company_city"),
  companyState: text("company_state"),
  companyZip: text("company_zip"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  logoUrl: text("logo_url"),
  currency: text("currency").notNull().default("BRL"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  theme: text("theme").notNull().default("light"),
  accentColor: text("accent_color").notNull().default("gold"),
  allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
  lowStockDefault: integer("low_stock_default").notNull().default(5),
  defaultMaxDiscount: numeric("default_max_discount", { precision: 6, scale: 2 })
    .notNull()
    .default("10"),
  sellerMaxDiscount: numeric("seller_max_discount", { precision: 6, scale: 2 })
    .notNull()
    .default("5"),
  requireDiscountReason: boolean("require_discount_reason").notNull().default(true),
  creditDefaultLimit: numeric("credit_default_limit", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  creditInterestRate: numeric("credit_interest_rate", { precision: 6, scale: 3 })
    .notNull()
    .default("2"), // % ao mês
  creditPenaltyRate: numeric("credit_penalty_rate", { precision: 6, scale: 3 })
    .notNull()
    .default("2"), // multa %
  creditDailyInterest: numeric("credit_daily_interest", { precision: 6, scale: 4 })
    .notNull()
    .default("0.033"), // % ao dia (juros de mora)
  creditGraceDays: integer("credit_grace_days").notNull().default(0),
  printFooter: text("print_footer"),
  fiscalProvider: text("fiscal_provider"),
  fiscalEnvironment: fiscalEnvironmentEnum("fiscal_environment").notNull().default("HOMOLOGATION"),
  fiscalSeriesNfce: integer("fiscal_series_nfce").notNull().default(1),
  fiscalNextNumberNfce: integer("fiscal_next_number_nfce").notNull().default(1),
  fiscalSeriesNfe: integer("fiscal_series_nfe").notNull().default(1),
  fiscalNextNumberNfe: integer("fiscal_next_number_nfe").notNull().default(1),
  fiscalCscId: text("fiscal_csc_id"),
  fiscalCscToken: text("fiscal_csc_token"),
  fiscalCertificateName: text("fiscal_certificate_name"),
  fiscalDefaultCfop: text("fiscal_default_cfop").notNull().default("5102"),
  fiscalDefaultNcm: text("fiscal_default_ncm"),
  fiscalDefaultCsosn: text("fiscal_default_csosn").notNull().default("102"),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  lgpdPrivacyContact: text("lgpd_privacy_contact"),
  lgpdRetentionMonths: integer("lgpd_retention_months").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
 * CATÁLOGO: CATEGORIAS, MARCAS, CORES, TAMANHOS, COLEÇÕES
 * ============================================================ */
export const categories = pgTable(
  "categories",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    dreGroupHint: text("dre_group_hint"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_company_name_parent_uq").on(t.companyId, t.name, t.parentId)],
);

export const brands = pgTable("brands", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const colors = pgTable("colors", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  hex: text("hex").notNull().default("#cccccc"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sizes = pgTable("sizes", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull().default("APPAREL"), // APPAREL | NUMERIC | SHOE | FREE
  sortOrder: integer("sort_order").notNull().default(0),
});

export const collections = pgTable("collections", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  year: integer("year"),
  season: text("season"),
  isActive: boolean("is_active").notNull().default(true),
});

/* ============================================================
 * FORNECEDORES
 * ============================================================ */
export const suppliers = pgTable(
  "suppliers",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    document: text("document"),
    stateRegistration: text("state_registration"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    addressNumber: text("address_number"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("suppliers_document_idx").on(t.document)],
);

/* ============================================================
 * PRODUTOS E VARIAÇÕES (GRADE COR x TAMANHO)
 * ============================================================ */
export const products = pgTable(
  "products",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    reference: text("reference").notNull(),
    barcode: text("barcode"),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    collectionId: uuid("collection_id").references(() => collections.id, { onDelete: "set null" }),
    material: text("material"),
    composition: text("composition"),
    origin: text("origin").notNull().default("0"), // origem fiscal da mercadoria
    ncm: text("ncm"),
    cest: text("cest"),
    cfop: text("cfop"),
    cstIcms: text("cst_icms"),
    csosn: text("csosn"),
    unit: text("unit").notNull().default("UN"),
    costPrice: numeric("cost_price", { precision: 14, scale: 2 }).notNull().default("0"),
    salePrice: numeric("sale_price", { precision: 14, scale: 2 }).notNull().default("0"),
    promoPrice: numeric("promo_price", { precision: 14, scale: 2 }),
    promoStartsAt: date("promo_starts_at"),
    promoEndsAt: date("promo_ends_at"),
    maxDiscountPercent: numeric("max_discount_percent", { precision: 6, scale: 2 }),
    lowStock: integer("low_stock").notNull().default(5),
    hasVariants: boolean("has_variants").notNull().default(true),
    isKit: boolean("is_kit").notNull().default(false),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    status: productStatusEnum("status").notNull().default("ACTIVE"),
    showOnline: boolean("show_online").notNull().default(false),
    weightKg: numeric("weight_kg", { precision: 8, scale: 3 }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Referência é única DENTRO da loja (duas lojas podem repetir).
    uniqueIndex("products_company_reference_uq").on(t.companyId, t.reference),
    uniqueIndex("products_company_barcode_uq").on(t.companyId, t.barcode),
    index("products_name_idx").on(sql`lower(${t.name})`),
    index("products_category_idx").on(t.categoryId),
    index("products_status_idx").on(t.status),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    colorId: uuid("color_id").references(() => colors.id, { onDelete: "set null" }),
    sizeId: uuid("size_id").references(() => sizes.id, { onDelete: "set null" }),
    colorName: text("color_name"),
    sizeName: text("size_name"),
    costPrice: numeric("cost_price", { precision: 14, scale: 2 }).notNull().default("0"),
    salePrice: numeric("sale_price", { precision: 14, scale: 2 }).notNull().default("0"),
    promoPrice: numeric("promo_price", { precision: 14, scale: 2 }),
    stockQty: numeric("stock_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    reservedQty: numeric("reserved_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    lowStock: integer("low_stock"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("variants_company_sku_uq").on(t.companyId, t.sku),
    uniqueIndex("variants_company_barcode_uq").on(t.companyId, t.barcode),
    index("variants_product_idx").on(t.productId),
    uniqueIndex("variants_product_color_size_uq").on(t.productId, t.colorId, t.sizeId),
  ],
);

export const productKitItems = pgTable(
  "product_kit_items",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    kitProductId: uuid("kit_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    componentVariantId: uuid("component_variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
  },
  (t) => [index("kit_items_kit_idx").on(t.kitProductId)],
);

export const priceHistories = pgTable(
  "price_histories",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    field: text("field").notNull(), // costPrice | salePrice | promoPrice
    oldValue: numeric("old_value", { precision: 14, scale: 2 }),
    newValue: numeric("new_value", { precision: 14, scale: 2 }),
    reason: text("reason"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_product_idx").on(t.productId, t.createdAt)],
);

/* ============================================================
 * ESTOQUE
 * ============================================================ */
export const warehouses = pgTable("warehouses", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockLevels = pgTable(
  "stock_levels",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stock_levels_uq").on(t.variantId, t.warehouseId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    type: stockMovementTypeEnum("type").notNull(),
    /** Quantidade positiva (entrada) ou negativa (saída) */
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    referenceType: text("reference_type"), // SALE | PURCHASE | RETURN | INVENTORY | MANUAL | TRANSFER
    referenceId: text("reference_id"),
    reason: text("reason"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_mov_variant_idx").on(t.variantId, t.createdAt),
    index("stock_mov_product_idx").on(t.productId, t.createdAt),
    index("stock_mov_created_idx").on(t.createdAt),
    index("stock_mov_reference_idx").on(t.referenceType, t.referenceId),
  ],
);

export const stockCounts = pgTable("stock_counts", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("OPEN"), // OPEN | CLOSED | CANCELED
  notes: text("notes"),
  startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  /** true = aplica ajustes de estoque ao fechar */
  applyAdjustments: boolean("apply_adjustments").notNull().default(true),
});

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    expectedQty: numeric("expected_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    countedQty: numeric("counted_qty", { precision: 14, scale: 3 }),
  },
  (t) => [uniqueIndex("stock_count_items_uq").on(t.countId, t.variantId)],
);

export const stockTransfers = pgTable("stock_transfers", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  fromWarehouseId: uuid("from_warehouse_id")
    .notNull()
    .references(() => warehouses.id, { onDelete: "restrict" }),
  toWarehouseId: uuid("to_warehouse_id")
    .notNull()
    .references(() => warehouses.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  transferId: uuid("transfer_id")
    .notNull()
    .references(() => stockTransfers.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
});

/* ============================================================
 * CLIENTES (CRM)
 * ============================================================ */
export const customers = pgTable(
  "customers",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    document: text("document"),
    personType: text("person_type").notNull().default("PF"),
    birthDate: date("birth_date"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    addressNumber: text("address_number"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    notes: text("notes"),
    sizePreference: text("size_preference"),
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    acceptsWhatsapp: boolean("accepts_whatsapp").notNull().default(false),
    acceptsEmail: boolean("accepts_email").notNull().default(false),
    lgpdConsentAt: timestamp("lgpd_consent_at", { withTimezone: true }),
    lgpdConsentSource: text("lgpd_consent_source"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("customers_name_idx").on(sql`lower(${t.name})`),
    index("customers_document_idx").on(t.document),
    index("customers_phone_idx").on(t.phone),
    index("customers_birth_idx").on(t.birthDate),
  ],
);

/* ============================================================
 * VENDAS / PDV
 * ============================================================ */
export const sales = pgTable(
  "sales",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull(),
    status: saleStatusEnum("status").notNull().default("OPEN"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    sellerId: uuid("seller_id").references(() => users.id, { onDelete: "set null" }),
    operatorId: uuid("operator_id").references(() => users.id, { onDelete: "set null" }),
    cashSessionId: uuid("cash_session_id"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    discountPercent: numeric("discount_percent", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    surchargeAmount: numeric("surcharge_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    costTotal: numeric("cost_total", { precision: 14, scale: 2 }).notNull().default("0"),
    profit: numeric("profit", { precision: 14, scale: 2 }).notNull().default("0"),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    changeAmount: numeric("change_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    itemCount: integer("item_count").notNull().default(0),
    notes: text("notes"),
    discountReason: text("discount_reason"),
    quoteId: uuid("quote_id"),
    originType: text("origin_type").notNull().default("PDV"), // PDV | QUOTE | EXCHANGE | API
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    canceledBy: uuid("canceled_by").references(() => users.id, { onDelete: "set null" }),
    cancelReason: text("cancel_reason"),
    fiscalStatus: text("fiscal_status").notNull().default("NONE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    // Numeração de venda é própria de cada loja.
    uniqueIndex("sales_company_number_uq").on(t.companyId, t.number),
    index("sales_created_idx").on(t.createdAt),
    index("sales_status_idx").on(t.status),
    index("sales_customer_idx").on(t.customerId),
    index("sales_seller_idx").on(t.sellerId),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    sku: text("sku"),
    barcode: text("barcode"),
    colorName: text("color_name"),
    sizeName: text("size_name"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    surchargeAmount: numeric("surcharge_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    isKit: boolean("is_kit").notNull().default(false),
    returnedQty: numeric("returned_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sale_items_sale_idx").on(t.saleId),
    index("sale_items_variant_idx").on(t.variantId),
  ],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    installments: integer("installments").notNull().default(1),
    /** Valor pago em espécie pelo cliente (para cálculo de troco) */
    tenderedAmount: numeric("tendered_amount", { precision: 14, scale: 2 }),
    changeAmount: numeric("change_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    firstDueDate: date("first_due_date"),
    cardBrand: text("card_brand"),
    authorizationCode: text("authorization_code"),
    notes: text("notes"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | REFUNDED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sale_payments_sale_idx").on(t.saleId)],
);

/* ============================================================
 * ORÇAMENTOS
 * ============================================================ */
export const quotes = pgTable(
  "quotes",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: quoteStatusEnum("status").notNull().default("OPEN"),
    validUntil: date("valid_until"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    convertedSaleId: uuid("converted_sale_id").references(() => sales.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quotes_status_idx").on(t.status)],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    sku: text("sku"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId)],
);

/* ============================================================
 * TROCAS E DEVOLUÇÕES
 * ============================================================ */
export const returns = pgTable(
  "returns",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    type: returnTypeEnum("type").notNull(),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    refundMethod: refundMethodEnum("refund_method").notNull().default("NONE"),
    returnedTotal: numeric("returned_total", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    newItemsTotal: numeric("new_items_total", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    difference: numeric("difference", { precision: 14, scale: 2 }).notNull().default("0"),
    newSaleId: uuid("new_sale_id").references(() => sales.id, { onDelete: "set null" }),
    creditGenerated: numeric("credit_generated", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("returns_sale_idx").on(t.saleId), index("returns_created_idx").on(t.createdAt)],
);

export const returnItems = pgTable(
  "return_items",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    saleItemId: uuid("sale_item_id").references(() => saleItems.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    action: returnActionEnum("action").notNull().default("RESTOCK"),
  },
  (t) => [index("return_items_return_idx").on(t.returnId)],
);

/* ============================================================
 * CAIXA
 * ============================================================ */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: cashSessionStatusEnum("status").notNull().default("OPEN"),
    openingAmount: numeric("opening_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    openingNotes: text("opening_notes"),
    countedAmount: numeric("counted_amount", { precision: 14, scale: 2 }),
    expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }),
    difference: numeric("difference", { precision: 14, scale: 2 }),
    countedBreakdown: jsonb("counted_breakdown").$type<Record<string, number>>(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closingNotes: text("closing_notes"),
    salesTotal: numeric("sales_total", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cash_sessions_status_idx").on(t.status), index("cash_sessions_user_idx").on(t.userId)],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),
    type: cashMovementTypeEnum("type").notNull(),
    method: paymentMethodEnum("method"),
    /** Positivo = entrada, negativo = saída */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    description: text("description"),
    referenceType: text("reference_type"), // SALE | RECEIVABLE | PAYABLE | RETURN | MANUAL
    referenceId: text("reference_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cash_mov_session_idx").on(t.sessionId, t.createdAt),
    index("cash_mov_ref_idx").on(t.referenceType, t.referenceId),
  ],
);

/* ============================================================
 * FINANCEIRO
 * ============================================================ */
export const financeCategories = pgTable("finance_categories", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: financeTypeEnum("type").notNull(),
  dreGroup: dreGroupEnum("dre_group").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const costCenters = pgTable("cost_centers", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const bankAccounts = pgTable("bank_accounts", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull().default("BANK"),
  bankName: text("bank_name"),
  agency: text("agency"),
  accountNumber: text("account_number"),
  initialBalance: numeric("initial_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  currentBalance: numeric("current_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payables = pgTable(
  "payables",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    description: text("description").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => financeCategories.id, {
      onDelete: "set null",
    }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, {
      onDelete: "set null",
    }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    documentNumber: text("document_number"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    dueDate: date("due_date").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    status: payableStatusEnum("status").notNull().default("PENDING"),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    purchaseOrderId: uuid("purchase_order_id"),
    recurringEntryId: uuid("recurring_entry_id"),
    notes: text("notes"),
    canceledReason: text("canceled_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payables_due_idx").on(t.dueDate),
    index("payables_status_idx").on(t.status),
    index("payables_supplier_idx").on(t.supplierId),
  ],
);

export const receivables = pgTable(
  "receivables",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
    salePaymentId: uuid("sale_payment_id").references(() => salePayments.id, {
      onDelete: "cascade",
    }),
    source: text("source").notNull().default("SALE"), // SALE | MANUAL | RENEGOTIATION
    description: text("description"),
    installmentNumber: integer("installment_number").notNull().default(1),
    installmentTotal: integer("installment_total").notNull().default(1),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    interestAmount: numeric("interest_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    penaltyAmount: numeric("penalty_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    dueDate: date("due_date").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    status: receivableStatusEnum("status").notNull().default("PENDING"),
    notes: text("notes"),
    renegotiationId: uuid("renegotiation_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("receivables_due_idx").on(t.dueDate),
    index("receivables_status_idx").on(t.status),
    index("receivables_customer_idx").on(t.customerId),
    index("receivables_sale_idx").on(t.saleId),
  ],
);

export const financeEntries = pgTable(
  "finance_entries",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // PAYMENT (pagamento) | RECEIPT (recebimento)
    payableId: uuid("payable_id").references(() => payables.id, { onDelete: "set null" }),
    receivableId: uuid("receivable_id").references(() => receivables.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull().default("CASH"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
  },
  (t) => [index("finance_entries_paid_idx").on(t.paidAt)],
);

export const accountTransfers = pgTable("account_transfers", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  fromAccountId: uuid("from_account_id")
    .notNull()
    .references(() => bankAccounts.id, { onDelete: "restrict" }),
  toAccountId: uuid("to_account_id")
    .notNull()
    .references(() => bankAccounts.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurringEntries = pgTable("recurring_entries", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  description: text("description").notNull(),
  type: financeTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  categoryId: uuid("category_id").references(() => financeCategories.id, { onDelete: "set null" }),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  frequency: invoiceFrequencyEnum("frequency").notNull().default("MONTHLY"),
  dayOfMonth: integer("day_of_month").notNull().default(5),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  lastGeneratedDate: date("last_generated_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditRenegotiations = pgTable("credit_renegotiations", {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "restrict" }),
  originalAmount: numeric("original_amount", { precision: 14, scale: 2 }).notNull(),
  interestAmount: numeric("interest_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  penaltyAmount: numeric("penalty_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  newAmount: numeric("new_amount", { precision: 14, scale: 2 }).notNull(),
  installments: integer("installments").notNull().default(1),
  firstDueDate: date("first_due_date").notNull(),
  notes: text("notes"),
  receivablesIds: jsonb("receivables_ids").$type<string[]>().notNull().default([]),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* Créditos de cliente (devoluções/trocas) */
export const customerCredits = pgTable(
  "customer_credits",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    usedAmount: numeric("used_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    origin: text("origin").notNull().default("RETURN"), // RETURN | MANUAL | OVERPAYMENT
    referenceId: text("reference_id"),
    notes: text("notes"),
    expiresAt: date("expires_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_credits_customer_idx").on(t.customerId)],
);

/* ============================================================
 * COMPRAS
 * ============================================================ */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: purchaseStatusEnum("status").notNull().default("DRAFT"),
    issueDate: date("issue_date").notNull(),
    expectedDate: date("expected_date"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    freightAmount: numeric("freight_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    installments: integer("installments").notNull().default(1),
    firstDueDate: date("first_due_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchase_supplier_idx").on(t.supplierId), index("purchase_status_idx").on(t.status)],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    sku: text("sku"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index("purchase_items_order_idx").on(t.purchaseOrderId)],
);

/* ============================================================
 * FISCAL
 * ============================================================ */
export const fiscalDocuments = pgTable(
  "fiscal_documents",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
    model: text("model").notNull().default("65"), // 65 = NFC-e, 55 = NF-e
    series: integer("series").notNull().default(1),
    number: integer("number").notNull(),
    environment: fiscalEnvironmentEnum("environment").notNull().default("HOMOLOGATION"),
    status: fiscalStatusEnum("status").notNull().default("PENDING"),
    accessKey: text("access_key"),
    protocol: text("protocol"),
    xml: text("xml"),
    rejectionCode: text("rejection_code"),
    rejectionMessage: text("rejection_message"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    provider: text("provider"),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fiscal_company_model_series_number_uq").on(t.companyId, t.model, t.series, t.number),
    index("fiscal_sale_idx").on(t.saleId),
  ],
);

/* ============================================================
 * NOTIFICAÇÕES
 * ============================================================ */
export const notifications = pgTable(
  "notifications",
  {
    /** Loja dona do registro — filtro automático em toda consulta. */
    companyId: uuid("company_id")
      .notNull()
      .default(sql`'00000000-0000-0000-0000-000000000000'::uuid`)
      .references(() => companies.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("INFO"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    dedupeKey: text("dedupe_key"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_company_dedupe_uq").on(t.companyId, t.dedupeKey),
    index("notifications_read_idx").on(t.isRead),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

/* ============================================================
 * SEQUÊNCIAS (numeração de documentos)
 * ============================================================ */
export const sequences = pgTable("sequences", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
 * RELATIONS (para queries relacionais do Drizzle)
 * ============================================================ */
export const usersRelations = relations(users, ({ many }) => ({
  sales: many(sales),
  sessions: many(sessions),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
  collection: one(collections, {
    fields: [products.collectionId],
    references: [collections.id],
  }),
  variants: many(productVariants),
}));

export const variantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  color: one(colors, { fields: [productVariants.colorId], references: [colors.id] }),
  size: one(sizes, { fields: [productVariants.sizeId], references: [sizes.id] }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  seller: one(users, { fields: [sales.sellerId], references: [users.id] }),
  items: many(saleItems),
  payments: many(salePayments),
  receivables: many(receivables),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  variant: one(productVariants, {
    fields: [saleItems.variantId],
    references: [productVariants.id],
  }),
}));

export const salePaymentsRelations = relations(salePayments, ({ one, many }) => ({
  sale: one(sales, { fields: [salePayments.saleId], references: [sales.id] }),
  receivables: many(receivables),
}));

export const receivablesRelations = relations(receivables, ({ one }) => ({
  customer: one(customers, { fields: [receivables.customerId], references: [customers.id] }),
  sale: one(sales, { fields: [receivables.saleId], references: [sales.id] }),
}));

export const payablesRelations = relations(payables, ({ one }) => ({
  supplier: one(suppliers, { fields: [payables.supplierId], references: [suppliers.id] }),
  category: one(financeCategories, {
    fields: [payables.categoryId],
    references: [financeCategories.id],
  }),
}));

export const cashSessionsRelations = relations(cashSessions, ({ one, many }) => ({
  user: one(users, { fields: [cashSessions.userId], references: [users.id] }),
  movements: many(cashMovements),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  session: one(cashSessions, {
    fields: [cashMovements.sessionId],
    references: [cashSessions.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  customer: one(customers, { fields: [quotes.customerId], references: [customers.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
}));

export const returnsRelations = relations(returns, ({ one, many }) => ({
  sale: one(sales, { fields: [returns.saleId], references: [sales.id] }),
  customer: one(customers, { fields: [returns.customerId], references: [customers.id] }),
  items: many(returnItems),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  items: many(purchaseItems),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  order: one(purchaseOrders, {
    fields: [purchaseItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
  receivables: many(receivables),
  credits: many(customerCredits),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, { relationName: "category_parent" }),
}));
