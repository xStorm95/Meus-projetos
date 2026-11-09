import { z } from "zod";
import { apiHandler, ok } from "@/server/lib/api";
import { getSettings, updateSettings } from "@/server/services/settings";
import { writeAudit } from "@/server/lib/audit";
import { normalizeHex, customAccentValue } from "@/server/lib/color";

const schema = z.object({
  logoUrl: z
    .string()
    .max(600_000, "Imagem muito grande (máx. ~400 KB).")
    .nullable()
    .optional(),
  appName: z.string().trim().min(2).max(40).optional(),
  /**
   * Paletas prontas ("gold", "rose", "emerald", "navy", "indigo", "graphite")
   * ou cor livre da logo no formato "custom:#rrggbb".
   */
  accentColor: z
    .string()
    .max(20)
    .refine(
      (value) =>
        ["gold", "rose", "emerald", "navy", "indigo", "graphite"].includes(value) ||
        (value.startsWith("custom:") && normalizeHex(value.slice(7)) !== null),
      "Cor inválida. Use uma paleta pronta ou um hex como custom:#c9a227.",
    )
    .optional(),
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
  if (body.accentColor) {
    patch.accentColor = body.accentColor.startsWith("custom:")
      ? customAccentValue(body.accentColor.slice(7))
      : body.accentColor;
  }

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
