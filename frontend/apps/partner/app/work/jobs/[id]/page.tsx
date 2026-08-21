import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { JobDetailScreen } from "@/features/work-stack/view/job-detail-screen";

/**
 * One job in progress, whichever kind of record it is.
 *
 * This route replaced three — `/jobs/[bookingId]`,
 * `/workforce/shifts/[engagementId]` and `/projects/stages/[engagementId]` — and
 * `next.config.ts` redirects all three here, so `[id]` carries either an A1
 * `PartnerVisit.id` or an M2 `Engagement.id`. `JobDetailScreen` is what decides
 * which; see its docblock for why the id itself cannot say.
 *
 * ## The shell is mounted here rather than in a layout
 *
 * There is no `app/work/jobs/[id]/layout.tsx`. The old `app/jobs/layout.tsx`
 * this replaced was a one-line `<PartnerShell requirePartnerRole>` wrap and
 * nothing else, so there is nothing to preserve — and every route in this
 * redesign mounts its own shell (`/me`, `/me/crew`,
 * `/work/offers/[invitationId]`, `/work/enquiries/[invitationId]`) because
 * `/work` itself is deliberately ungated. A layout wrap plus a page wrap would
 * nest two shells and draw two tab bars.
 *
 * `requirePartnerRole`, because arriving here means the job was already
 * accepted: every command behind this screen is `IsPartnerUser` server-side, and
 * a session holding the grant while acting as another role is offered the switch
 * by the shell rather than a page of 403s.
 *
 * `force-dynamic`, never indexed: the record belongs to one Partner.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job",
  robots: { index: false, follow: false },
};

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <JobDetailScreen id={id} />
    </PartnerShell>
  );
}
