"use client";

import {
  bookingPhase,
  canCheckOutVisitPlan,
  canReadFullEstimates,
  unlockPhase,
  visitPlanPhase,
} from "@vsolve/query";
import type { ReactNode } from "react";

import { useRateCardState } from "@/features/crew/queries";
import { CrewDispatchPanel } from "@/features/crew/view/crew-dispatch-panel";
import { useCustomerQuotes } from "@/features/quotes/queries";
import type { RequirementArchetype } from "@/features/requirement/adapters";
import {
  toTeaserListView,
  toVisitTrackerView,
  unlockPriceLabel,
  vendorNamesByVisit,
} from "../adapters";
import {
  useQuoteTeasers,
  useStartUnlockCheckout,
  useUnlockState,
  useVisitPlan,
} from "../queries";
import { visitHref } from "@/lib/routes";

import { UnlockPanel } from "./unlock-panel";
import { VisitTracker } from "./visit-tracker";

/**
 * The money surface on one request — the A3 door or the A5 one, never both.
 *
 * Mounted on `/requests/{id}` under the request's own state notice. Which half
 * renders is decided by the **server's inferred archetype**, because the two
 * doors have different endpoints and different refusals: calling
 * `POST .../unlock/` on an A5 request answers `400 m2_lifecycle_not_supported`,
 * and the Customer would meet it.
 *
 * An unrecognised archetype renders nothing at all. Wave A2 builds A3 and A5;
 * a lifecycle this bundle has no screens for must show no money control rather
 * than the closest-looking one.
 *
 * ## Why the reads are mounted per archetype and not both
 *
 * Unlike the quotes screen — which has no archetype in hand until something
 * answers — this component is handed one. Mounting the other read would put a
 * `400` on every A5 request detail, which is noise that eventually gets
 * ignored, and ignored noise is where a real refusal hides.
 */

export interface RequestAccessPanelProps {
  requirementId: string;
  archetype: RequirementArchetype | null;
  /** Where the full quotes and estimates are read. */
  quotesHref: string;
  /** Where the A5 plan is paid for. */
  bookVisitsHref: string;
  /** Where the A3 booking fee is paid (revision 4). */
  bookCrewFeeHref: string;
  supportAction?: ReactNode;
  /** Forwarded to the A3 phone screens. See `CrewDispatchPanel`. */
  serviceName?: string;
  /** Forwarded to the A3 waiting screen's rail. See `CrewDispatchPanel`. */
  requestFacts?: { addressLine: string | null; startsOn: string | null };
}

export function RequestAccessPanel(props: RequestAccessPanelProps) {
  if (props.archetype === "A3_TIME_BLOCK") return <A3Access {...props} />;
  if (props.archetype === "A5_CUSTOM_PROJECT") return <A5Access {...props} />;
  return null;
}

/**
 * The A3 money surface — two doors since revision 4, and never both at once.
 *
 * The **rate card** is the primary front door: a published day rate, a crew
 * offer cascade and one booking fee. The **unlock** is the thin-supply fallback,
 * built in Wave A2 and deliberately not deleted — it is what a request falls
 * back to past the cascade threshold, and it is still the only path for a city
 * or skill with no published card.
 *
 * Which one renders is decided by the server's own `RateCardBooking`:
 *
 * | Booking | Renders |
 * |---|---|
 * | none | The unlock surface, exactly as before. This request never used the instant path |
 * | `MATCHING` / `OFFER_HELD` / `CONFIRMED` / `CANCELLED` | The crew panel only |
 * | `FELL_BACK` | The handoff explanation **and** the unlock surface beneath it |
 *
 * Rendering both in the ordinary case would give one request two money controls
 * and two different promises about what happens next, which is the one thing a
 * Customer looking at a request must never see.
 */
function A3Access({
  requirementId,
  quotesHref,
  bookCrewFeeHref,
  supportAction,
  requestFacts,
  serviceName,
}: RequestAccessPanelProps) {
  const rateQuery = useRateCardState(requirementId);
  const rateState = rateQuery.data ?? null;
  const crewPhase = rateState === null ? null : bookingPhase(rateState);

  // Until the rate-card read answers, the request is on neither door yet. The
  // unlock panel's own loading state covers it — showing the quote surface and
  // then replacing it with a crew panel would flash a paywall at somebody who
  // has a crew booked.
  const onInstantPath = crewPhase !== null && crewPhase !== "unbooked";
  const showQuoteFallback = !onInstantPath || crewPhase === "fell_back";

  return (
    <div className="flex flex-col gap-6">
      {onInstantPath ? (
        <CrewDispatchPanel
          requirementId={requirementId}
          bookCrewFeeHref={bookCrewFeeHref}
          supportAction={supportAction}
          requestFacts={requestFacts}
          serviceName={serviceName}
        />
      ) : null}

      {showQuoteFallback ? (
        <A3QuoteAccess
          requirementId={requirementId}
          quotesHref={quotesHref}
          isResolvingDoor={rateQuery.isPending}
          supportAction={supportAction}
        />
      ) : null}
    </div>
  );
}

/** The A3 quote-flow door: teasers, then the unlock. Unchanged since Wave A2. */
function A3QuoteAccess({
  requirementId,
  quotesHref,
  isResolvingDoor,
  supportAction,
}: {
  requirementId: string;
  quotesHref: string;
  isResolvingDoor: boolean;
  supportAction?: ReactNode;
}) {
  const teasersQuery = useQuoteTeasers(requirementId);
  const unlockQuery = useUnlockState(requirementId);
  const checkout = useStartUnlockCheckout();

  const unlock = unlockQuery.data ?? null;
  const teasers = teasersQuery.data === undefined ? null : toTeaserListView(teasersQuery.data);
  const phase = unlock === null ? null : unlockPhase(unlock);

  return (
    <UnlockPanel
      phase={phase ?? "not_yet"}
      priceLabel={unlockPriceLabel(unlock?.price_paise ?? null)}
      usableQuoteCount={unlock?.usable_quote_count ?? teasers?.usableQuoteCount ?? 0}
      teasers={teasers?.teasers ?? []}
      isLoading={isResolvingDoor || unlockQuery.isPending || teasersQuery.isPending}
      // The unlock read is the one that decides what may be offered, so its
      // failure is the one that must stop the panel. A teaser read that fails
      // leaves an empty list, which reads as "no quotes yet" — and that is why
      // its error is surfaced too rather than swallowed.
      readError={unlockQuery.error ?? teasersQuery.error}
      onRetryRead={() => {
        void unlockQuery.refetch();
        void teasersQuery.refetch();
      }}
      onStartCheckout={() =>
        checkout.mutate({ requirementId, isRetryAfterFailure: phase === "failed" })
      }
      isStartingCheckout={checkout.isPending}
      checkoutError={checkout.error}
      quotesHref={quotesHref}
      supportAction={supportAction}
    />
  );
}

function A5Access({
  requirementId,
  quotesHref,
  bookVisitsHref,
  supportAction,
}: RequestAccessPanelProps) {
  const planQuery = useVisitPlan(requirementId);

  const state = planQuery.data ?? null;

  /**
   * The estimates, read now only as a *fallback* name for a confirmed slot.
   *
   * The visit publishes its own vendor since contract 1.39.0, so this is no
   * longer how the tracker learns who is coming. It is kept because a delivered
   * estimate can name a vendor on a visit whose own disclosure window has not
   * opened, and losing that would be a name disappearing from a screen that
   * already showed it. Enabled strictly on the server's own entitlement flag,
   * because an unentitled call is a `409` on the ordinary pre-payment path.
   */
  const quotesQuery = useCustomerQuotes(
    requirementId,
    state !== null && canReadFullEstimates(state),
  );

  const vendorNames =
    quotesQuery.data === undefined ? new Map<string, string>() : vendorNamesByVisit(quotesQuery.data.quotes);

  const tracker = state === null ? null : toVisitTrackerView(state, vendorNames);

  return (
    <VisitTracker
      phase={state === null ? "choosing" : visitPlanPhase(state)}
      tracker={tracker}
      isLoading={planQuery.isPending}
      readError={planQuery.error}
      onRetryRead={() => void planQuery.refetch()}
      bookVisitsHref={bookVisitsHref}
      checkoutAvailable={state !== null && canCheckOutVisitPlan(state)}
      estimatesHref={quotesHref}
      // The visit-day commands moved with the prose, onto the visit's own page.
      // A destructive control repeated once per row on a list somebody is
      // scanning is a control pressed by accident.
      visitHref={(siteVisitId) => visitHref(requirementId, siteVisitId)}
      supportAction={supportAction}
      // No plan switcher here, and that is a correction rather than an omission.
      //
      // The server does allow re-choosing until a vendor commits, so a control
      // was added on this screen. What it produced was worse than the
      // convenience: the invitation wave is bounded by the plan size *at the
      // moment it went out*, so resizing afterwards leaves a request showing
      // "2 professionals invited" above three slots, two of which nobody was
      // ever asked to fill. One tap silently rearranged the flow.
      //
      // The choice belongs on review, before the request is sent, which is where
      // it is offered — and where changing it costs nothing because nothing has
      // been invited yet. Once professionals are looking at this job, resizing
      // it is a support conversation, not a segmented control.
    />
  );
}

