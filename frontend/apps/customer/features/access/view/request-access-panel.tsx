"use client";

import {
  canCheckOutVisitPlan,
  canReadFullEstimates,
  unlockPhase,
  visitPlanPhase,
} from "@vsolve/query";
import type { ReactNode } from "react";

import { useCustomerQuotes } from "@/features/quotes/queries";
import type { RequirementArchetype } from "@/features/requirement/adapters";
import {
  toTeaserListView,
  toVisitTrackerView,
  unlockPriceLabel,
  vendorNamesByVisit,
} from "../adapters";
import {
  useConfirmVisitArrival,
  useQuoteTeasers,
  useReportVendorNoShow,
  useStartUnlockCheckout,
  useUnlockState,
  useVisitPlan,
} from "../queries";
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
  supportAction?: ReactNode;
}

export function RequestAccessPanel(props: RequestAccessPanelProps) {
  if (props.archetype === "A3_TIME_BLOCK") return <A3Access {...props} />;
  if (props.archetype === "A5_CUSTOM_PROJECT") return <A5Access {...props} />;
  return null;
}

function A3Access({
  requirementId,
  quotesHref,
  supportAction,
}: RequestAccessPanelProps) {
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
      isLoading={unlockQuery.isPending || teasersQuery.isPending}
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
  const arrival = useConfirmVisitArrival();
  const noShow = useReportVendorNoShow();

  const state = planQuery.data ?? null;

  /**
   * The estimates, read only to put a name on a confirmed slot.
   *
   * The visit read publishes no vendor, so a delivered estimate is the only
   * place this app can learn who came. Enabled strictly on the server's own
   * entitlement flag, because an unentitled call is a `409` on the ordinary
   * pre-payment path.
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
      onConfirmArrival={(siteVisitId) => arrival.mutate({ siteVisitId, requirementId })}
      onReportNoShow={(siteVisitId) =>
        // The reason code is fixed rather than collected. The Customer already
        // confirmed the one fact that matters — nobody turned up — and asking
        // them to classify it would be collecting a taxonomy nothing publishes.
        noShow.mutate({ siteVisitId, requirementId, reasonCode: "vendor_did_not_arrive" })
      }
      isCommandPending={arrival.isPending || noShow.isPending}
      commandError={arrival.error ?? noShow.error}
      supportAction={supportAction}
    />
  );
}
