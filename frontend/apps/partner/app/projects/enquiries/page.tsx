import type { Metadata } from "next";

import { PROJECT_WORKSPACE } from "@/features/workspace/registry";
import { WorkspacePendingScreen } from "@/features/workspace/view/workspace-screens";

/**
 * Shares an endpoint with the workforce enquiry list and not a screen: an A5
 * vendor answers with a staged proposal (`M2-FE-309`) where an A3 vendor answers
 * with a rate per worker per day (`M2-FE-308`). Both are next wave.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiries",
  robots: { index: false, follow: false },
};

export default function ProjectEnquiriesPage() {
  return (
    <WorkspacePendingScreen
      workspaceKey={PROJECT_WORKSPACE}
      actions={["enquiry.view"]}
      what="Enquiries"
    />
  );
}
