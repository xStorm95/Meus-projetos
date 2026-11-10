import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { ProfileView } from "@/components/profile/profile-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <ProfileView
      initial={{
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        avatarUrl: user.avatarUrl,
        roleLabel: user.roleLabel,
      }}
    />
  );
}
