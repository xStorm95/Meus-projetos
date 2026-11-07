import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { getSettings, updateSettings } from "@/server/services/settings";
import { writeAudit } from "@/server/lib/audit";

const schema = z.object({
  logoUrl: z
    .string()
    .max(600_000, "Imagem muito grande (máx. ~400 KB).")
    .nullable()
    .optional(),
  appName: z.string().trim().min(2).max(40).optional(),
  accentColor: z.enum(["gold", "rose", "emerald", "indigo", "graphite"]).optional(),
});

/** Personalização da marca: nome do sistema, logo (data URL validada) e cor. */
export const PATCH = apiHandler({ permission: "settings.manage", body: schema }, async ({ body, user }) => {
  const patch: Record<string, unknown> = {};
  if (body.logoUrl !== undefined) {
    if (body.logoUrl && !/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(body.logoUrl) && !/^https?:\/\//.test(body.logoUrl)) {
      throw new Error("Formato de imagem não suportado. Use PNG, JPG, WEBP ou SVG.");
    }
    patch.logoUrl = body.logoUrl;
  }
  if (body.appName) patch.appName = body.appName;
  if (body.accentColor) patch.accentColor = body.accentColor;

  const updated = Object.keys(patch).length ? await updateSettings(patch as never) : await getSettings();
  await writeAudit({
    userId: user.id,
    userName: user.name,
    action: "BRANDING_UPDATE",
    entity: "settings",
    entityId: "default",
    description: "Identidade visual atualizada.",
  });
  return ok({
    branding: {
      appName: updated.appName,
      logoUrl: updated.logoUrl,
      accentColor: updated.accentColor,
    },
  });
});
