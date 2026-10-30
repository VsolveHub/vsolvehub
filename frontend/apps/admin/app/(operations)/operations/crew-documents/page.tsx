import type { Metadata } from "next";
import { PageHeader } from "@vsolve/ui";

import { CrewVerificationWorkspace } from "@/features/crew-verification/view/crew-verification-workspace";

export const metadata: Metadata = { title: "Crew documents" };

export default function CrewDocumentsPage() {
  return (
    <div>
      <PageHeader
        title="Crew documents"
        description="Review crew-member identity checks and record the result before a partner can assign them to customer work."
      />
      <CrewVerificationWorkspace />
    </div>
  );
}
