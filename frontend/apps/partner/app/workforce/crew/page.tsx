import type { Metadata } from "next";

import { CrewRosterScreen } from "@/features/crew/view/crew-screens";

/**
 * The crew roster (`M2-FE-107`).
 *
 * This route rendered `WorkspacePending` until 13 August, on the reasoning that
 * an "Add someone" button with nothing to call was worse than saying the screen
 * was not built. Contract 1.22.0 published `GET`/`POST /partner/crew/` and the
 * per-membership `PATCH` and `archive` on 12 August, so the button has something
 * to call and the pending screen is the dishonest option now.
 *
 * `force-dynamic`, never indexed — like every authenticated Partner route. A
 * roster is a list of named people; it is not a search result.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your crew",
  robots: { index: false, follow: false },
};

export default function WorkforceCrewPage() {
  return <CrewRosterScreen />;
}
