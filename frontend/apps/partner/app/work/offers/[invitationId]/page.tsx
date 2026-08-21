import type { Metadata } from "next";

import { OfferDetailScreen } from "@/features/crew-offer/view/offer-detail-screen";
import { PartnerShell } from "@/features/session/partner-shell";

/**
 * One A3 crew offer, reached from its card in the merged WORK stack.
 *
 * Never cached and never indexed: the offer belongs to one Partner and expires
 * in minutes.
 *
 * ## `requirePartnerRole`, unlike `/work` itself
 *
 * `app/work/page.tsx` mounts the shell *without* the role gate, and says why:
 * its first branch is "you have not applied yet", and Django grants the
 * `partner` role when an application is created — so gating it would refuse the
 * person that branch is written for. Nothing about that applies here. This
 * screen is reached only from an offer card inside `/work`, which only an
 * approved Partner acting as one ever sees, and both commands behind it
 * (`accept_crew_offer`, `decline_crew_offer`) are `IsPartnerUser` server-side.
 * A session holding the grant while acting as another role is offered the switch
 * by the shell rather than a page of 403s. `app/me/crew/page.tsx` is the same
 * call for the same reason.
 *
 * ## The shell is mounted here rather than in an `app/work/layout.tsx`
 *
 * A layout under `/work` would have to pick one gate for both this route and the
 * ungated `/work`, and the two are genuinely different. Each route under `/work`
 * therefore mounts the shell it needs — which is also what keeps a second shell
 * from nesting inside the first.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false, follow: false },
};

export default async function OfferPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <OfferDetailScreen invitationId={invitationId} />
    </PartnerShell>
  );
}
