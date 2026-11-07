import type { Metadata } from "next";

import { AccountSection } from "@/features/account/view/chrome";
import { DocumentsScreen } from "@/features/account/view/documents-screen";

export const metadata: Metadata = {
  title: "Your documents",
  robots: { index: false, follow: false },
};

export default function AccountDocumentsPage() {
  return (
    <AccountSection
      title="Your verified documents"
      description="Identity credentials, address proofs, and service invoices."
      collapseHeaderOnMobile
    >
      <DocumentsScreen />
    </AccountSection>
  );
}
