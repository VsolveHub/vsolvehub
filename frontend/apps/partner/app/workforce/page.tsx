import type { Metadata } from "next";

import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspaceHomeScreen } from "@/features/workspace/view/workspace-screens";

/**
 * The A3 workforce workspace, which exists only for the Partners approved for
 * it. Never cached and never indexed, like the rest of the authenticated tree.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workforce",
  robots: { index: false, follow: false },
};

export default function WorkforcePage() {
  return <WorkspaceHomeScreen workspaceKey={WORKFORCE_WORKSPACE} />;
}
