import type { Metadata } from "next";

import { PROJECT_WORKSPACE } from "@/features/workspace/registry";
import { WorkspacePendingScreen } from "@/features/workspace/view/workspace-screens";

/**
 * Stage evidence, funding state and retention — `M2-FE-601..607`, no endpoint.
 * A stage is a stage: it is not a shift and it is not a job, and one Engagement
 * spine in the backend does not make the three one word here.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stages",
  robots: { index: false, follow: false },
};

export default function ProjectStagesPage() {
  return (
    <WorkspacePendingScreen
      workspaceKey={PROJECT_WORKSPACE}
      actions={["stage.submit_evidence"]}
      what="Stages"
    />
  );
}
