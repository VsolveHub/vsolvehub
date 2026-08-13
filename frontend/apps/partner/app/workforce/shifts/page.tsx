import type { Metadata } from "next";

import { WorkforceEngagementsScreen } from "@/features/engagement/view/engagement-screens";

/**
 * The workforce engagement list — `M2-FE-501`.
 *
 * A shift stays a shift here: the word is not shared with `/jobs`, which is the
 * A1 task lifecycle, and one `Engagement` spine in the backend does not make the
 * two one word in the UI.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shifts",
  robots: { index: false, follow: false },
};

export default function WorkforceShiftsPage() {
  return <WorkforceEngagementsScreen heading="Shifts" />;
}
