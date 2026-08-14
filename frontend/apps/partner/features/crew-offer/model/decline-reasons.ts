import type { Schemas } from "@vsolve/api-client";

/**
 * Why a lead is passing on a crew offer.
 *
 * The reason half of `M2-FE-316`. Same construction as the enquiry inbox's
 * `decline-reasons.ts`, and deliberately a **second** vocabulary rather than a
 * shared one: `InvitationDeclineReasonEnum` describes turning down a request to
 * *quote*, and half of it (`BUDGET_TOO_LOW`, `UNCLEAR_SCOPE`) cannot happen on
 * this path — there is no budget to be short and nothing to quote on. The server
 * publishes `CrewOfferDeclineReasonCodeEnum` for exactly that reason, and the
 * list below is derived from the generated type rather than authored beside it,
 * so a code added or renamed on the server fails `pnpm typecheck` here instead of
 * being posted into a `400`.
 *
 * ## The reason is not admin, it is the alarm
 *
 * ADR-0009 makes the decline rate an **Operations alarm rather than a report**: a
 * published rate that has fallen below the street rate that week makes leads
 * silently decline everything, and the instant product dies quietly with nobody
 * looking at a monthly dashboard. `RATE_TOO_LOW` is the answer that pages
 * somebody. So the consequence line on each option is not reassurance copy — it
 * is the truth about what the platform does with the answer, and it is what makes
 * the required field worth requiring.
 *
 * The platform never argues back here. A lead who says the rate is too low is
 * the market speaking, and the only correct response is to look at the rate.
 */

export type CrewOfferDeclineReasonCode = Schemas["CrewOfferDeclineReasonCodeEnum"];

export interface CrewOfferDeclineReason {
  /** The published code. The rate card's decline-rate alarm groups on it. */
  readonly code: CrewOfferDeclineReasonCode;
  /** What the lead picks, written from their side. */
  readonly label: string;
  /** What Vsolve does with it. Stated so the answer is a choice, not a field. */
  readonly consequence: string;
}

/**
 * Every published code.
 *
 * `Record<CrewOfferDeclineReasonCode, ...>` rather than a bare array: a value
 * added to the enum on the next regeneration fails the type check here rather
 * than silently disappearing from the list.
 */
const REASON_COPY: Record<CrewOfferDeclineReasonCode, Omit<CrewOfferDeclineReason, "code">> = {
  RATE_TOO_LOW: {
    label: "The rate is below what I can work for",
    consequence:
      "This is the one Vsolve acts on fastest. Enough of these at a rate and Operations is paged to review it for your city, not sent a monthly report.",
  },
  NO_CREW_AVAILABLE: {
    label: "I have nobody free on those days",
    consequence: "We stop offering you work on these dates and pass this on to the next lead.",
  },
  TOO_FAR: {
    label: "This is too far to travel",
    consequence: "We look at your service areas before offering you this area again.",
  },
  SITE_UNSUITABLE: {
    label: "The site or the work is not what we do",
    consequence: "Operations is told the request may be described wrongly before it goes out again.",
  },
  OTHER: {
    label: "Something else",
    consequence:
      "Recorded as a decline with no reason we can act on. One of the above is worth more to you than this one.",
  },
};

/**
 * Reading order: the answer that changes the rate first.
 *
 * Not alphabetical and not the enum's own order. `RATE_TOO_LOW` is the signal
 * the whole alarm exists for, and burying it under three logistics reasons is how
 * a lead reaches for `OTHER` instead.
 *
 * **A ranking, never the list itself.** An array of codes beside a `Record` of the
 * same codes is a hand-copied second copy of a published vocabulary, and the copy
 * drifts: a sixth code added on the server would be forced into `REASON_COPY` by
 * the exhaustive `Record` and could still be left out of a plain order array,
 * which compiles cleanly and silently removes the option from the dropdown. So
 * the list is **derived from `REASON_COPY`'s own keys** and this only decides
 * where each one sits. A code nobody ranked sorts to the end and still renders.
 */
const REASON_PRIORITY: readonly CrewOfferDeclineReasonCode[] = [
  "RATE_TOO_LOW",
  "NO_CREW_AVAILABLE",
  "TOO_FAR",
  "SITE_UNSUITABLE",
  "OTHER",
];

function rankOf(code: CrewOfferDeclineReasonCode): number {
  const index = REASON_PRIORITY.indexOf(code);
  return index === -1 ? REASON_PRIORITY.length : index;
}

export const CREW_OFFER_DECLINE_REASONS: readonly CrewOfferDeclineReason[] = (
  Object.keys(REASON_COPY) as CrewOfferDeclineReasonCode[]
)
  .map((code) => ({ code, ...REASON_COPY[code] }))
  .sort((left, right) => rankOf(left.code) - rankOf(right.code));

const BY_CODE = new Map<string, CrewOfferDeclineReason>(
  CREW_OFFER_DECLINE_REASONS.map((reason) => [reason.code, reason]),
);

export function findCrewOfferDeclineReason(code: string): CrewOfferDeclineReason | null {
  return BY_CODE.get(code) ?? null;
}

/**
 * Narrows a free string to a published code, or nothing.
 *
 * Used at the form seam. The `<select>` can only hold a value this build
 * rendered, so a miss means the enum moved under the bundle — and posting an
 * unpublished code earns a `400` the lead cannot act on.
 */
export function asCrewOfferDeclineReasonCode(code: string): CrewOfferDeclineReasonCode | null {
  return findCrewOfferDeclineReason(code)?.code ?? null;
}
