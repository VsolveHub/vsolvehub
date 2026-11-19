import type { Metadata } from "next";
import { PageHeader } from "@vsolve/ui";

import { PrivacyRequestsWorkspace } from "@/features/privacy-requests/view/privacy-requests-workspace";

export const metadata: Metadata = {
  title: "Account deletions",
  robots: { index: false, follow: false },
};

export default function AccountDeletionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PageHeader
        title="Account deletions"
        description="People who asked to delete their account, or for a copy of their data. Deletions run on their date by themselves; act here on holds, calls to keep an account, and data copies."
      />
      <PrivacyRequestsWorkspace />
    </div>
  );
}
