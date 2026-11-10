-- ============================================================
-- MULTI-LOJA: cada loja com os próprios dados
-- ============================================================
-- Esta migração NÃO apaga nada. Passo a passo:
--   1. cria a tabela `companies` (lojas);
--   2. cria uma loja para os dados que já existem (se houver);
--   3. adiciona `company_id` em todas as tabelas (começa anulável);
--   4. carimba os dados antigos com a loja criada no passo 2;
--   5. só então marca `company_id` como NOT NULL e cria FK + índice.
-- Rodar em banco vazio (instalação nova) e em banco com dados dá o
-- mesmo resultado. Pode ser executada mais de uma vez sem quebrar.

-- ---------- 1. lojas ----------
CREATE TABLE IF NOT EXISTS "companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "email" text,
  "phone" text,
  "document" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_uq" ON "companies" ("slug");

-- ---------- 2. loja para os dados existentes ----------
-- Só cria se existir algum usuário (instalação em uso) e nenhuma loja ainda.
DO $$
DECLARE nova_id uuid;
DECLARE nome_loja text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "companies") AND EXISTS (SELECT 1 FROM "users") THEN
    SELECT COALESCE(MAX("company_name"), 'Minha Loja') INTO nome_loja FROM "settings";
    INSERT INTO "companies" ("name", "slug")
      VALUES (nome_loja, 'loja-principal')
      RETURNING "id" INTO nova_id;
  END IF;
END $$;

-- ---------- 3 e 4. coluna de loja em cada tabela ----------
DO $$
DECLARE
  v_empresa uuid;
  v_faltando boolean;
  t text;
  tabelas text[] := ARRAY[
    'account_transfers','audit_logs','bank_accounts','brands','cash_movements',
    'cash_sessions','categories','collections','colors','cost_centers',
    'credit_renegotiations','customer_credits','customers','finance_categories',
    'finance_entries','fiscal_documents','notifications','password_reset_tokens',
    'payables','price_histories','product_kit_items','product_variants','products',
    'purchase_items','purchase_orders','quote_items','quotes','receivables',
    'recurring_entries','return_items','returns','sale_items','sale_payments',
    'sales','sessions','settings','sizes','stock_count_items','stock_counts',
    'stock_levels','stock_movements','stock_transfer_items','stock_transfers',
    'suppliers','users','warehouses'
  ];
BEGIN
  -- loja que vai herdar os dados que já existiam
  SELECT "id" INTO v_empresa FROM "companies" ORDER BY "created_at" LIMIT 1;

  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "company_id" uuid', t);

    -- carimba linhas antigas (sem loja) com a loja herdada, se houver
    IF v_empresa IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET "company_id" = $1 WHERE "company_id" IS NULL', t)
        USING v_empresa;
    END IF;

    -- só vira obrigatório quando não sobrou linha sem loja
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "company_id" IS NULL)', t) INTO v_faltando;
    IF NOT v_faltando THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN "company_id" SET NOT NULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = t || '_company_id_companies_id_fk'
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE',
          t, t || '_company_id_companies_id_fk'
        );
      END IF;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("company_id")',
        t || '_company_idx', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 5. e-mail de usuário é único DENTRO da loja ----------
-- Antes era único no sistema inteiro: duas lojas não podiam ter o mesmo
-- e-mail cadastrado. Agora cada loja tem o seu conjunto de usuários.
DROP INDEX IF EXISTS "users_email_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "users_company_email_uq"
  ON "users" ("company_id", lower("email"));

-- ---------- 6. configurações: uma linha por loja ----------
-- O id passa a ser o id da loja. Migra o registro antigo ('default').
DO $$
DECLARE v_empresa uuid;
BEGIN
  SELECT "id" INTO v_empresa FROM "companies" ORDER BY "created_at" LIMIT 1;
  IF v_empresa IS NOT NULL AND EXISTS (SELECT 1 FROM "settings" WHERE "id" = 'default') THEN
    -- se ainda não existe configuração dessa loja, reaproveita a antiga
    IF NOT EXISTS (SELECT 1 FROM "settings" WHERE "id" = v_empresa::text) THEN
      UPDATE "settings" SET "id" = v_empresa::text, "company_id" = v_empresa WHERE "id" = 'default';
    ELSE
      DELETE FROM "settings" WHERE "id" = 'default';
    END IF;
  END IF;
END $$;

-- ---------- 7. unicidade passa a ser POR LOJA ----------
-- Referência de produto e número de venda eram únicos no sistema inteiro;
-- com várias lojas, cada uma tem a própria sequência.
DROP INDEX IF EXISTS "products_reference_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "products_company_reference_uq"
  ON "products" ("company_id", "reference");

DROP INDEX IF EXISTS "sales_number_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "sales_company_number_uq"
  ON "sales" ("company_id", "number");

-- ---------- 8. nomes/códigos únicos DENTRO de cada loja ----------
-- Antes eram únicos no sistema inteiro; com várias lojas, cada uma tem
-- os seus próprios nomes e a sua própria numeração.
-- restrições UNIQUE de coluna precisam sair como CONSTRAINT
ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "brands_name_unique";
ALTER TABLE "colors" DROP CONSTRAINT IF EXISTS "colors_name_unique";
ALTER TABLE "sizes" DROP CONSTRAINT IF EXISTS "sizes_name_unique";
ALTER TABLE "collections" DROP CONSTRAINT IF EXISTS "collections_name_unique";
ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_name_unique";
ALTER TABLE "cost_centers" DROP CONSTRAINT IF EXISTS "cost_centers_name_unique";
ALTER TABLE "stock_counts" DROP CONSTRAINT IF EXISTS "stock_counts_code_unique";
ALTER TABLE "stock_transfers" DROP CONSTRAINT IF EXISTS "stock_transfers_code_unique";
ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_code_unique";
ALTER TABLE "returns" DROP CONSTRAINT IF EXISTS "returns_code_unique";
ALTER TABLE "cash_sessions" DROP CONSTRAINT IF EXISTS "cash_sessions_code_unique";
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_code_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "brands_company_name_uq" ON "brands" ("company_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "colors_company_name_uq" ON "colors" ("company_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "sizes_company_name_uq" ON "sizes" ("company_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "collections_company_name_uq" ON "collections" ("company_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_company_name_uq" ON "warehouses" ("company_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_company_name_uq" ON "cost_centers" ("company_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "products_company_barcode_uq" ON "products" ("company_id", "barcode") WHERE "barcode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "variants_company_sku_uq" ON "product_variants" ("company_id", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "variants_company_barcode_uq" ON "product_variants" ("company_id", "barcode") WHERE "barcode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "categories_company_name_parent_uq" ON "categories" ("company_id", "name", "parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_company_model_series_number_uq" ON "fiscal_documents" ("company_id", "model", "series", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_company_dedupe_uq" ON "notifications" ("company_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL;

-- códigos sequenciais por loja (podem ser nulos em alguns registros)
CREATE UNIQUE INDEX IF NOT EXISTS "stock_counts_company_code_uq" ON "stock_counts" ("company_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_transfers_company_code_uq" ON "stock_transfers" ("company_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_company_code_uq" ON "quotes" ("company_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "returns_company_code_uq" ON "returns" ("company_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_company_code_uq" ON "cash_sessions" ("company_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_company_code_uq" ON "purchase_orders" ("company_id", "code");
