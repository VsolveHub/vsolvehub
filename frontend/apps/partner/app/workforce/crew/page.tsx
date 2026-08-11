import type { Metadata } from "next";

import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspacePendingScreen } from "@/features/workspace/view/workspace-screens";

/**
 * The roster view (`features/crew/view/crew-roster.tsx`) is built and tested,
 * and is deliberately not mounted here yet: it takes an `onAdd` and an
 * `onArchive`, and proposal 0013's crew endpoints are unpublished, so there is
 * nothing for either to call. Mounting it against no-op handlers would put an
 * "Add someone" button on screen that silently does nothing — a worse answer
 * than saying the screen is not built.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your crew",
  robots: { index: false, follow: false },
};

export default function WorkforceCrewPage() {
  return (
    <WorkspacePendingScreen
      workspaceKey={WORKFORCE_WORKSPACE}
      actions={["crew.manage"]}
      what="Your crew"
    />
  );
}
