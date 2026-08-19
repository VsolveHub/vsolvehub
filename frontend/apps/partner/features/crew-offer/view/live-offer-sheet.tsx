"use client";

import { useServerCountdown } from "@vsolve/query";
import { Badge, Button, Sheet, formatMoney } from "@vsolve/ui";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { isOfferLive } from "../model/offer-state";
import { useAcceptCrewOffer, usePartnerCrewOffers, type CrewOffer } from "../queries";

/**
 * A live crew offer, wherever the lead happens to be.
 *
 * ## Why this is not a page
 *
 * A crew offer expires in about two minutes. The offers page renders them
 * perfectly and is useless to a lead who is on their earnings screen, their
 * profile, or an enquiry when one lands — and that is most of the time, because
 * the cascade pushes offers rather than the lead going to fetch them. A missed
 * offer is lost income *and* a wave that widens for no reason.
 *
 * A notification-bell badge was the cheaper option and is the wrong one at this
 * deadline: a badge is a thing you notice later, and there is no later here.
 *
 * ## It adds no transport
 *
 * This is the same `usePartnerCrewOffers` query the offers page already runs, on
 * the same fifteen-second bounded poll. Mounting it in the shell does not double
 * the polling — TanStack dedupes by query key, so the page and the sheet share
 * one observer and one request. Offers were already dynamic; they were merely
 * confined to one route.
 *
 * ## Two guards on what counts as live
 *
 * The server refuses to return a lapsed offer, and `isOfferLive` re-checks the
 * deadline against `server_now` when the lead actually looks. Between a
 * fifteen-second poll and a hundred-and-twenty-second deadline the cached list
 * is routinely a few seconds stale, and a button rendered inside that window
 * produces a refusal describing a race that never happened.
 *
 * ## Suppressed on the offers page
 *
 * Where the list is already on screen, a sheet over it is the same offer twice
 * with two accept buttons — and the one underneath would keep working.
 */
export function LiveOfferSheet() {
  const pathname = usePathname();
  const onOffersPage = pathname?.startsWith("/offers") ?? false;

  const offersQuery = usePartnerCrewOffers(!onOffersPage);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const data = offersQuery.data ?? null;
  const live =
    data === null ? [] : data.offers.filter((offer) => isOfferLive(offer, data.server_now));
  // Soonest deadline first: the server already orders by `responds_by`, and the
  // one about to lapse is the one worth interrupting for.
  const offer = live[0] ?? null;

  if (onOffersPage || offer === null || dismissed === offer.invitation_id) return null;

  return (
    <OfferSheet
      key={offer.invitation_id}
      offer={offer}
      onDismiss={() => setDismissed(offer.invitation_id)}
    />
  );
}

/**
 * Split out, and keyed by invitation, so the countdown belongs to one offer.
 *
 * The parent may render a different offer on the next poll. A countdown hook
 * reading `responds_by` off a changing row would keep counting the previous
 * deadline down for a commit, which on a two-minute clock is visible.
 */
function OfferSheet({ offer, onDismiss }: { offer: CrewOffer; onDismiss: () => void }) {
  const accept = useAcceptCrewOffer(offer.invitation_id);
  const countdown = useServerCountdown(offer.responds_by, 1000);

  return (
    <Sheet open onOpenChange={(next) => (next ? undefined : onDismiss())} title="A job is waiting for your answer">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-semibold text-text">
            {offer.headcount === 1 ? "1 person" : `${offer.headcount} people`} ·{" "}
            {offer.days === 1 ? "1 day" : `${offer.days} days`}
          </p>
          {countdown !== null ? (
            // The countdown is the whole reason this interrupts rather than
            // waits. `announce` rather than the digits for assistive tech: a
            // per-second reading of a ticking clock is unusable.
            <Badge tone={countdown.remainingMs <= 30_000 ? "danger" : "warning"} dot>
              <span aria-hidden>{countdown.display} left</span>
              <span className="sr-only">{countdown.announce}</span>
            </Badge>
          ) : null}
        </div>

        <p className="text-sm leading-6 text-text">
          <strong className="font-semibold">{formatMoney(offer.lead_day_receipt_paise)}</strong> to
          you per day, paid directly by the customer at the end of each day.
        </p>
        {offer.area_label ? (
          <p className="text-sm leading-6 text-text-secondary">{offer.area_label}</p>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            onClick={() => accept.mutate()}
            loading={accept.isPending}
            loadingLabel="Taking the job"
          >
            Take this job
          </Button>
          {/* Dismiss, never decline. Declining carries a required reason that
              feeds the decline-rate alarm, and a lead who closed a sheet has not
              given one. The offer stays on the offers page, where declining has
              the reason picker it needs. */}
          <Button variant="ghost" onClick={onDismiss}>
            Not now
          </Button>
        </div>

        <p className="text-xs leading-5 text-text-secondary">
          Taking it holds the job while the customer pays the booking fee.{" "}
          <strong className="font-semibold text-text">Do not travel yet</strong> — we will tell
          you the moment it is confirmed.
        </p>
      </div>
    </Sheet>
  );
}
