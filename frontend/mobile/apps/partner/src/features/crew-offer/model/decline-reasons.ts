// Ported from frontend/apps/partner/features/crew-offer/model/decline-reasons.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * Why a lead is passing on a crew offer.
 *
 * A **second** vocabulary from the enquiry inbox's, on purpose:
 * `InvitationDeclineReasonEnum` describes turning down a request to *quote*, and
 * half of it cannot happen on this path. The server publishes
 * `CrewOfferDeclineReasonCodeEnum` for exactly that reason, and the list below is
 * derived from the generated type rather than authored beside it, so a code added
 * or renamed on the server fails `pnpm typecheck` here instead of being posted
 * into a `400`.
 *
 * ## The reason is not admin, it is the alarm
 *
 * ADR-0009 makes the decline rate an **Operations alarm rather than a report**:
 * `RATE_TOO_LOW` is the answer that pages somebody. So the consequence on each
 * tile is the truth about what the platform does with the answer, kept to one
 * short line so the tile stays a tile.
 */

export type CrewOfferDeclineReasonCode = Schemas["CrewOfferDeclineReasonCodeEnum"];

export interface CrewOfferDeclineReason {
  /** The published code. The rate card's decline-rate alarm groups on it. */
  readonly code: CrewOfferDeclineReasonCode;
  /** What the lead picks, written from their side. One line. */
  readonly label: string;
  /** What Vsolve does with it. One short line. */
  readonly consequence: string;
}

/**
 * Every published code, as a `Record` rather than a bare array: a value added to
 * the enum on the next regeneration fails the type check here rather than
 * silently disappearing from the list.
 */
const REASON_COPY: Record<CrewOfferDeclineReasonCode, Omit<CrewOfferDeclineReason, "code">> = {
  RATE_TOO_LOW: {
    label: "Rate too low",
    consequence: "Ops reviews the rate for your city.",
  },
  NO_CREW_AVAILABLE: {
    label: "No crew free",
    consequence: "We skip you on these dates.",
  },
  TOO_FAR: {
    label: "Too far",
    consequence: "We re-check your service areas.",
  },
  SITE_UNSUITABLE: {
    label: "Not our kind of work",
    consequence: "Ops re-checks the request.",
  },
  OTHER: {
    label: "Something else",
    consequence: "Recorded, nothing acted on.",
  },
};

/**
 * Reading order: the answer that changes the rate first.
 *
 * A ranking, never the list itself — the list is derived from `REASON_COPY`'s
 * own keys, so a code nobody ranked sorts to the end and still renders.
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
 * Narrows a free string to a published code, or nothing. A miss means the enum
 * moved under the bundle, and posting an unpublished code earns a `400`.
 */
export function asCrewOfferDeclineReasonCode(code: string): CrewOfferDeclineReasonCode | null {
  return findCrewOfferDeclineReason(code)?.code ?? null;
}
