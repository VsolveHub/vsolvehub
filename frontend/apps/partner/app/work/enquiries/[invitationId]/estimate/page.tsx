import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { OnsiteEstimateScreen } from "@/features/proposal/view/onsite-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your estimate",
  robots: { index: false, follow: false },
};

/**
 * The on-site estimate composer (`/work/enquiries/[invitationId]/estimate`).
 *
 * ## This is a new route file, not a relocated one
 *
 * The task brief describing this file assumed an existing page at
 * `app/projects/enquiries/[invitationId]/estimate/page.tsx` that only needed
 * its path moved. No such file exists anywhere in this repository — searched
 * by exact path, by glob (`**\/tap-estimate*`, `**\/estimate*`) and by
 * grepping every `.tsx`/`.ts` file under `app/` for `OnsiteEstimateScreen` and
 * `projects/enquiries`: the only hits are `next.config.ts`'s redirect table
 * (which already points the old URL at this one, in anticipation of this route
 * being built) and the component's own definition in
 * `features/proposal/view/onsite-screen.tsx`. `OnsiteEstimateScreen` — which
 * wraps the already-shipped, tap-first `TapEstimateComposer`/`TapEstimate` —
 * was built but never mounted at any route before this task. So this file
 * wires up that existing, unchanged component for the first time; it is not a
 * copy of a prior page.
 *
 * `OnsiteEstimateScreen` composes its own `WorkspaceRoute` gate internally
 * (`PROJECT_WORKSPACE`, `enquiry.view`) exactly as `CrewRosterScreen` composes
 * its own `WorkspaceRoute`-equivalent gate — so, matching `/me/crew`'s
 * precedent, `PartnerShell requirePartnerRole` wraps it from the outside for
 * the tab bar and top chrome, while the page-specific authorization stays
 * inside the screen component untouched.
 */
export default async function EnquiryEstimatePage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return (
    <PartnerShell requirePartnerRole>
      <OnsiteEstimateScreen invitationId={invitationId} />
    </PartnerShell>
  );
}
