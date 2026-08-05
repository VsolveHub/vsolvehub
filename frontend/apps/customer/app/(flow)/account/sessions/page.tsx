import type { Metadata } from "next";

import { SessionList } from "@/features/account/view/session-list";
import { AccountSection } from "@/features/account/view/chrome";

export const metadata: Metadata = {
  title: "Signed-in devices",
  robots: { index: false, follow: false },
};

export default function AccountSessionsPage() {
  return (
    <AccountSection
      title="Signed-in devices"
      description="Every device signed in to this account. End any you do not recognise."
    >
      <SessionList />
    </AccountSection>
  );
}
