import type { Metadata } from "next";

import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspacePendingScreen } from "@/features/workspace/view/workspace-screens";

/**
 * `GET /api/v1/partner/enquiries/` is published at contract 1.21.0, so this is
 * the client catching up rather than the server: the list, the detail and the
 * accept/decline consequences are `M2-FE-301..304` in the next wave. The route
 * exists now because the tab does — `enquiry.view` is granted today, and a tab
 * that 404s inside a Partner's own workspace reads as the app being broken.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiries",
  robots: { index: false, follow: false },
};

export default function WorkforceEnquiriesPage() {
  return (
    <WorkspacePendingScreen
      workspaceKey={WORKFORCE_WORKSPACE}
      actions={["enquiry.view"]}
      what="Enquiries"
    />
  );
}
