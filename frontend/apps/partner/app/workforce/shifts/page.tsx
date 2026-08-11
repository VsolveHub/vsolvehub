import type { Metadata } from "next";

import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspacePendingScreen } from "@/features/workspace/view/workspace-screens";

/**
 * Daily attendance and per-stage crew assignment — `M2-FE-501..508`, and no
 * endpoint for either. A shift stays a shift here: the word is not shared with
 * `/jobs`, which is the A1 task lifecycle.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shifts",
  robots: { index: false, follow: false },
};

export default function WorkforceShiftsPage() {
  return (
    <WorkspacePendingScreen
      workspaceKey={WORKFORCE_WORKSPACE}
      actions={["attendance.confirm"]}
      what="Shifts"
    />
  );
}
