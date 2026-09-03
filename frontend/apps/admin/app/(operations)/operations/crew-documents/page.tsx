import { PageHeader } from "@vsolve/ui";

import { CrewVerificationWorkspace } from "@/features/crew-verification/view/crew-verification-workspace";

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
