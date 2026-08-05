import type { Metadata } from "next";

import { ConsentReceipts } from "@/features/account/view/consent-receipts";
import { PrivacyRequests } from "@/features/account/view/privacy-requests";
import { AccountSection } from "@/features/account/view/chrome";

/**
 * Consents and data requests on one screen.
 *
 * They are separate endpoints but a single question — *what have I agreed to,
 * and how do I get it back or get rid of it?* Splitting them across two nav
 * items would make someone looking for their consent record find a page that
 * points at another page.
 *
 * Consents come first: they are the record, and the requests below are what you
 * do about it.
 */
export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
};

export default function AccountPrivacyPage() {
  return (
    <div className="flex flex-col gap-6">
      <AccountSection
        title="Consents"
        description="What you have agreed to, and when we record it."
      >
        <ConsentReceipts />
      </AccountSection>

      <AccountSection
        title="Your data"
        description="Ask for a copy of what we hold, or ask us to delete it."
      >
        <PrivacyRequests />
      </AccountSection>
    </div>
  );
}
