--> statement-breakpoint
-- PIX: chave e dados do recebedor usados no BR Code (QR + copia e cola).
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "pix_key" text;

--> statement-breakpoint
-- Nome do recebedor que aparece no app do banco (padrão: máx. 25 caracteres).
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "pix_receiver_name" text;

--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "pix_city" text;

--> statement-breakpoint
-- Etiquetas: tamanho padrão do papel e o que sai impresso.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "label_size" text NOT NULL DEFAULT '60x40';

--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "label_show_price" boolean NOT NULL DEFAULT true;

--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "label_show_barcode" boolean NOT NULL DEFAULT true;

--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "label_extra_text" text;

--> statement-breakpoint
-- Modo offline do PDV: quanto tempo guardar as vendas pendentes e se o recurso está ativo.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "offline_sales_enabled" boolean NOT NULL DEFAULT true;
