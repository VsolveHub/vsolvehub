import type { Metadata } from "next";

import { ProfileOverview } from "@/features/account/view/profile-overview";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

/** The profile avatar lands here; related records remain in the account rail. */
export default function AccountPage() {
  return <ProfileOverview />;
}
