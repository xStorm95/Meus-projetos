import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { demoAutoLoginPermitido } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("settings.view")) redirect("/");

  const settings = await getSettings();

  return (
    <SettingsView
      settings={JSON.parse(
        JSON.stringify({
          ...settings,
          fiscalCscToken: settings.fiscalCscToken ? "••••••" : null,
        }),
      )}
      permissions={{
        canManage: user.permissions.includes("settings.manage"),
        canBackup: user.permissions.includes("backup.run"),
        isDemo: await demoAutoLoginPermitido(),
      }}
    />
  );
}
