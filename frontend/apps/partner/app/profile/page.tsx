import type { Metadata } from "next";

import { ProfilePanel } from "@/features/profile/view/profile-panel";

/** One person's own record. Never cached, never indexed. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfilePanel />;
}
