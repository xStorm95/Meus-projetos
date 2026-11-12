--> statement-breakpoint
-- O índice único de numeração fiscal precisa incluir a loja.
--
-- A migração multi-loja (0001) criou `fiscal_company_model_series_number_uq`
-- em (company_id, model, series, number) mas deixou vivo o índice antigo
-- `fiscal_model_series_number_uq` em (model, series, number), que é GLOBAL.
-- Consequência real: a primeira loja emite a NFC-e nº 1; qualquer outra loja
-- que tentasse emitir a sua nº 1 recebia 500 (duplicate key) — ou seja, só uma
-- loja por instalação conseguia emitir documento fiscal.
DROP INDEX IF EXISTS "fiscal_model_series_number_uq";

--> statement-breakpoint
-- Garante o índice correto (idempotente para instalações que já o têm).
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_company_model_series_number_uq"
  ON "fiscal_documents" ("company_id", "model", "series", "number");
