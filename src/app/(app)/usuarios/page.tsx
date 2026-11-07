import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listActiveSessions, listUsers, ROLE_OPTIONS } from "@/server/services/users";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/server/auth/permissions";
import { UsersView } from "@/components/users/users-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários e permissões" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("users.view")) redirect("/");

  const [users, sessions] = await Promise.all([listUsers(), listActiveSessions(60)]);

  return (
    <UsersView
      users={users as never}
      roles={ROLE_OPTIONS}
      permissionCatalog={ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key] }))}
      sessions={sessions as never}
      currentUserId={user.id}
      canManage={user.permissions.includes("users.manage")}
    />
  );
}
