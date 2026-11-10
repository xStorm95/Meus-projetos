--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;

--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_date" date;
