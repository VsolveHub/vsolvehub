import type { Metadata } from "next";

import { PROJECT_WORKSPACE } from "@/features/workspace/registry";
import { WorkspaceHomeScreen } from "@/features/workspace/view/workspace-screens";

/**
 * The A5 project workspace. Never cached and never indexed, like the rest of
 * the authenticated tree.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default function ProjectsPage() {
  return <WorkspaceHomeScreen workspaceKey={PROJECT_WORKSPACE} />;
}
