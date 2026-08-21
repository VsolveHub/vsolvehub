"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { ErrorState, Spinner } from "@vsolve/ui";
import type { ReactNode } from "react";

import { Pictogram } from "@/components/pictogram";
import { usePartnerEngagement } from "@/features/engagement/queries";
import { BookingSupport } from "@/features/support/view/booking-support";
import { usePartnerVisit } from "@/features/work/queries";

import { EngagementJobView } from "./engagement-job-view";
import { VisitJobView } from "./visit-job-view";

/**
 * One route, two record kinds.
 *
 * `/work/jobs/[id]` replaced three routes — `/jobs/[bookingId]`,
 * `/workforce/shifts/[engagementId]` and `/projects/stages/[engagementId]` —
 * that each knew their own kind from the URL segment they lived under. This one
 * does not have that luxury: an A1 `PartnerVisit.id` and an M2 `Engagement.id`
 * are both UUIDs from different tables and there is no shared id space to
 * disambiguate by format. `next.config.ts` points all three old paths here, so
 * every one of those ids arrives on this single segment.
 *
 * ## The engagement is asked first, and the order is not a preference
 *
 * A two-kind resolver needs one of its two reads to be able to say **"not
 * mine"** without that also meaning "something went wrong". Exactly one of these
 * two endpoints can:
 *
 * - `GET /api/v1/engagements/{id}/` publishes `{200, 404}`
 *   (`EngagementDetailView`, `apps/requirements/views/selection.py:279`) and
 *   resolves through `engagement_for_participant`, whose docstring reads "One
 *   engagement, if the caller is either party to it. **A 404 otherwise**"
 *   (`apps/requirements/selectors.py:537-553`). An unknown id, a foreign
 *   engagement and a booking id all land on the same honest 404.
 * - `GET /api/v1/partner/bookings/{id}/` publishes `{200, 403}` and **no 404 at
 *   all** (`PartnerBookingDetailView`, `apps/fulfilment/views/partner.py:188`).
 *   `_partner_booking` raises `_forbidden()` for a missing row and for another
 *   Partner's row alike (`apps/fulfilment/views/base.py:102-106`), deliberately:
 *   "A distinct 404 for an unknown id and a 403 for someone else's id would make
 *   this an existence oracle" (`base.py:63-71`), asserted by
 *   `test_another_partner_cannot_reach_a_booking_and_cannot_tell_it_exists`
 *   (`backend/tests/fulfilment/test_fulfilment_api.py:148-165`).
 *
 * So asking for the visit first is a trap: every engagement id would answer
 * `403`, which is indistinguishable from a session-level refusal, and the whole
 * M2 branch would sit unreachable behind a "Try again" that can never succeed.
 * The engagement read goes first because it is the one that can say no.
 *
 * ## What a `403` from the visit read means once we are here
 *
 * "Not yours, whether or not it exists" — a terminal answer, not a transient
 * failure. `usePartnerVisit` already refuses to retry it
 * (`features/work/queries.ts:93-96`), so drawing a "Try again" against it would
 * be a button documented never to work. It renders `Gone`.
 *
 * That reading is safe because this route mounts
 * `<PartnerShell requirePartnerRole>`, which resolves
 * `requiredRoles: [PARTNER_ROLE], requireActiveRole: true` before these children
 * ever render (`features/session/partner-shell.tsx:143-149`, `:232-241`) — a
 * session not acting as a Partner is shown `SwitchToPartner`, never this screen.
 * The session-level 403 that would otherwise be confusable with "not yours"
 * cannot reach here.
 *
 * ## The cost, stated
 *
 * An A1 visit now costs one 404 before its own read. That is a round trip on the
 * higher-volume path, and it is the price of the only wrong-kind signal either
 * endpoint publishes. Both reads are cached under their own keys, so it is paid
 * once per id rather than once per render.
 */
export function JobDetailScreen({ id }: { id: string }) {
  const engagement = usePartnerEngagement(id);

  // The one signal that means "ask the other table". Byte-identical to
  // `@vsolve/query`'s `isEngagementNotFound`, which is imported nowhere here
  // because the same predicate is applied to the *booking* read below and a name
  // claiming otherwise would be worse than a second line.
  const notAnEngagement = isNotFound(engagement.error);

  // `usePartnerVisit` takes `string | null` and is disabled on `null`
  // (`features/work/queries.ts:90`), which is how this read is deferred until
  // the engagement lookup has actually ruled itself out.
  const visit = usePartnerVisit(notAnEngagement ? id : null);

  if (engagement.isPending || (notAnEngagement && visit.isPending)) {
    return (
      <Screen>
        <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner size="sm" />
          Loading this job…
        </p>
      </Screen>
    );
  }

  if (engagement.data !== undefined) {
    return (
      <>
        <EngagementJobView key={engagement.data.id} engagement={engagement.data} />
        <div className="bg-canvas px-4 pb-6">
          <BookingSupport reference={engagement.data.id} />
        </div>
      </>
    );
  }

  // The engagement read failed for a reason a retry can fix.
  if (!notAnEngagement) {
    return <ReadFailure error={engagement.error} onRetry={() => void engagement.refetch()} />;
  }

  if (visit.data !== undefined) {
    return (
      <>
        <VisitJobView key={visit.data.id} visit={visit.data} />
        <div className="bg-canvas px-4 pb-6">
          <BookingSupport reference={visit.data.id} />
        </div>
      </>
    );
  }

  // Neither table has it: not an agreement either party to, and not a booking of
  // this Partner's. `403` is the booking endpoint's whole vocabulary for that;
  // `404` is accepted too, so a proxy or a future contract change that starts
  // publishing one does not fall through into a retry loop.
  if (isNotYours(visit.error)) return <Gone />;

  return <ReadFailure error={visit.error} onRetry={() => void visit.refetch()} />;
}

/** `404`: the engagement read's honest "not an agreement you are party to". */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/**
 * The booking read's terminal refusal.
 *
 * `403` because that endpoint answers nothing else for a row that is missing or
 * somebody else's; `404` defensively, for the same answer said the other way.
 */
function isNotYours(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}

/* --------------------------------------------------------------------------
   Pieces
   -------------------------------------------------------------------------- */

/**
 * `min-h-[calc(100dvh-9rem)]` rather than `min-h-screen`: `PartnerShell` owns a
 * sticky top bar and a fixed bottom tab bar, so a full-viewport `main` inside it
 * scrolls by exactly the height of that chrome with nothing on the screen. 9rem
 * is that allowance, and it is the same figure `offer-detail-screen.tsx`,
 * `enquiry-detail-screen.tsx`, `work-home.tsx` and `me-home.tsx` carry.
 */
function Screen({ children }: { children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">{children}</main>;
}

/** A read that failed for a reason a retry can fix, bound to that read's own refetch. */
function ReadFailure({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  const presentation = describeError(error, "read");

  return (
    <Screen>
      <div className="px-4 py-6">
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={onRetry}
          reference={presentation.reference}
        />
      </div>
    </Screen>
  );
}

/**
 * This id is neither an engagement nor a booking on this account.
 *
 * A picture, not a paragraph: an old link, a job cancelled out from under the
 * Partner, or somebody else's reference. No "Try again", because neither read's
 * answer changes on a second attempt. The sentence is read out rather than
 * drawn, the same way `EmptyWork` and `ClosedNotice` do it, and the shell's tab
 * bar is the way off the screen.
 */
function Gone() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center py-16">
        <div className="grid h-42 w-42 place-items-center rounded-full bg-surface-sunken">
          <Pictogram name="stopped" className="h-21 w-21 text-[var(--color-warm-400)]" />
        </div>
        <p className="mt-5 max-w-[22ch] text-center text-base font-semibold text-text-secondary">
          No job with this reference on your account
        </p>
      </div>
    </Screen>
  );
}
