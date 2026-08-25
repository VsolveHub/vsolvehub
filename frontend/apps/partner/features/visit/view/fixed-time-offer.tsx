"use client";

import { Button, ErrorState, formatMoney } from "@vsolve/ui";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { useAcceptEnquiry, useDeclineEnquiry } from "@/features/enquiry/queries";

import { describeVisitDuration, formatVisitInstant } from "../model/slot-grid";

/**
 * Answering a visit offer, now that there is nothing to schedule.
 *
 * ## What this replaced, and why
 *
 * `VisitResponse` stood here until contract 1.44.0. It fetched a grid of
 * candidate slots, let the partner choose one, and confirmed it. That whole
 * surface — `/enquiries/{id}/visit-slots/`, `VisitSlotGrid`,
 * `VisitSlotConfirmation` — was removed from the published contract, because
 * BE-2 moved the choice to the customer. There is no endpoint left through
 * which a partner can propose or pick a time.
 *
 * So the offer arrives fixed: `fixed_visit_start`, its duration, what it pays,
 * and `responds_by` as the deadline. Two answers, and neither is a calendar.
 *
 * The note about there being nothing to schedule is deliberate and stays.
 * A partner who has answered the old offers will look for the picker, and an
 * absence with no explanation reads as a broken screen rather than a changed
 * rule.
 */

export interface FixedTimeOfferProps {
  enquiry: EnquiryRecord;
}

export function FixedTimeOffer({ enquiry }: FixedTimeOfferProps) {
  // The browser's own zone. `formatVisitInstant` reports back when it cannot
  // honour one, which matters on a device with a zone Intl does not carry — a
  // visit shown in the wrong hour is worse than one shown without a zone.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);
  const busy = accept.isPending || decline.isPending;

  // An enquiry with no fixed visit is not an offer this screen can answer. It
  // renders the fact rather than an empty shell: the alternative is a partner
  // pressing accept on a time nobody has set.
  if (enquiry.fixedVisitStart === null) {
    return (
      <ErrorState
        inline
        severity="info"
        title="No visit time yet"
        message="The customer has not picked a time for this visit. We will send it to you the moment they do."
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
          The customer chose this time
        </p>
        <p className="text-lg font-bold tracking-[-0.02em] text-text">
          {formatVisitInstant(enquiry.fixedVisitStart, timeZone).label}
        </p>
        <p className="text-sm text-text-secondary">
          {enquiry.fixedVisitDurationMinutes === null
            ? "Duration not given"
            : describeVisitDuration(enquiry.fixedVisitDurationMinutes)}
          {enquiry.fixedVisitEarningPaise === null
            ? null
            : ` · you receive ${formatMoney(enquiry.fixedVisitEarningPaise)}`}
        </p>
      </div>

      <p className="text-sm leading-6 text-text-secondary">
        Take it or pass — there is nothing to schedule. The first professional to
        accept gets the visit.
      </p>

      {accept.isError ? (
        <ErrorState
          inline
          severity="warning"
          title="This visit was taken by another professional"
          message="Someone accepted it first. Nothing is owed either way, and the next offer will reach you the same way."
        />
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button
          block
          size="lg"
          onClick={() => accept.mutate()}
          disabled={busy}
          loading={accept.isPending}
          loadingLabel="Accepting"
        >
          Take this visit
        </Button>
        <Button
          block
          variant="outline"
          size="lg"
          onClick={() => decline.mutate({ reasonCode: "NO_CAPACITY" })}
          disabled={busy}
          loading={decline.isPending}
          loadingLabel="Passing"
        >
          Pass on this one
        </Button>
      </div>
    </section>
  );
}
