import type { Metadata } from "next";
import { PageHeader } from "@vsolve/ui";

import { ServiceFeedbackWorkspace } from "@/features/service-feedback/view/service-feedback-workspace";

export const metadata: Metadata = { title: "Service feedback" };

export default function ServiceFeedbackPage() {
  return (
    <div>
      <PageHeader
        title="Service feedback"
        description="What customers say about each service, and about us. The partner score and the platform score are kept apart, because a five-star crew behind a two-star booking experience is the finding worth acting on."
      />
      <ServiceFeedbackWorkspace />
    </div>
  );
}
