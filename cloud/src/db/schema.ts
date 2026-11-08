/**
 * Schema do banco (PostgreSQL / Neon) usando Drizzle ORM.
 * Uma conta por e-mail, sessões com token em hash, foto guardada em base64.
 */
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    emailNormalized: varchar("email_normalized", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("owner"),
    phone: varchar("phone", { length: 20 }),
    document: varchar("document", { length: 18 }),
    birthDate: varchar("birth_date", { length: 10 }),
    city: varchar("city", { length: 120 }),
    bio: varchar("bio", { length: 300 }),
    avatar: text("avatar"),
    avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_email_idx").on(table.emailNormalized),
    index("accounts_created_idx").on(table.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.tokenHash),
    index("sessions_account_idx").on(table.accountId),
  ],
);

/** Estado do app (produtos, vendas, clientes, configurações) por conta e por chave. */
export const userState = pgTable(
  "user_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    stateKey: varchar("state_key", { length: 64 }).notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_state_key_idx").on(table.accountId, table.stateKey),
    index("user_state_account_idx").on(table.accountId),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
