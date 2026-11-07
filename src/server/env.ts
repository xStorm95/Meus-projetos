/**
 * Validação de variáveis de ambiente com Zod.
 * Falha rápido no boot se algo essencial estiver faltando/incorreto.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET deve ter no mínimo 32 caracteres"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  APP_URL: z.string().default("http://localhost:3000"),
  USE_EMBEDDED_PG: z.coerce.boolean().default(false),
  /**
   * MODO DEMONSTRAÇÃO — acessa o sistema automaticamente com o usuário
   * administrador, sem tela de login. Use SOMENTE em ambiente de avaliação.
   * NUNCA ative em produção (o código de autenticação continua ativo e é
   * reativado simplesmente definindo DEMO_AUTO_LOGIN="false").
   */
  DEMO_AUTO_LOGIN: z.coerce.boolean().default(false),
  EMBEDDED_PG_PORT: z.coerce.number().int().positive().default(5432),
  EMBEDDED_PG_DIR: z.string().default("./.pgdata"),
  UPLOAD_DIR: z.string().default("./public/uploads"),
  FISCAL_PROVIDER: z.string().optional().default(""),
  FISCAL_API_KEY: z.string().optional().default(""),
  FISCAL_ENVIRONMENT: z.enum(["homologation", "production"]).default("homologation"),
  WHATSAPP_API_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => ` - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${issues}\n\nVeja .env.example`);
  }
  cached = parsed.data;
  return cached;
}

/** Integrações externas: informa se estão realmente configuradas. */
export function integrationStatus() {
  const e = env();
  return {
    fiscal: {
      configured: Boolean(e.FISCAL_PROVIDER && e.FISCAL_API_KEY),
      provider: e.FISCAL_PROVIDER || null,
      environment: e.FISCAL_ENVIRONMENT,
    },
    whatsapp: {
      configured: Boolean(e.WHATSAPP_API_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID),
    },
    demoMode: e.DEMO_AUTO_LOGIN,
  };
}
