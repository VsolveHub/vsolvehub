import type { Metadata } from "next";

import { CommunicationPreferences } from "@/features/account/view/communication-preferences";
import { CustomerPushPreferencesSection } from "@/features/account/view/push-preferences";
import { AccountSection } from "@/features/account/view/chrome";

export const metadata: Metadata = {
  title: "Message settings",
  robots: { index: false, follow: false },
};

export default function AccountMessagesPage() {
  return (
    <AccountSection
      title="Messages"
      description="Choose what we send you, and where it goes."
    >
      <CommunicationPreferences />
      <CustomerPushPreferencesSection />
    </AccountSection>
  );
}
