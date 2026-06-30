import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { ProfileEditForm } from "@/components/customer/profile/ProfileEditForm";

export default async function ProfileEditPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile/edit");

  return (
    <ProfileEditForm
      name={session.name ?? ""}
      phone={session.phone}
    />
  );
}
