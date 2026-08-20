import type { Metadata } from "next";

import { ProfileEditor } from "@/features/account/view/profile-editor";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export default function EditProfilePage() {
  return <ProfileEditor />;
}
