import type { Schemas } from "@vsolve/api-client";
import type { useT } from "@vsolve/ui";

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
 *
 * ## Locale text, not module-scope literals
 *
 * This is a plain module, not a component, so it cannot call `useT()` itself.
 * The label/consequence copy lives in the `work.crewOfferDeclineReasons.*`
 * catalogue keys and is resolved at the call site, which already has `t` —
 * `getCrewOfferDeclineReasons`/`findCrewOfferDeclineReason` take it as a
 * parameter rather than returning hard-coded English.
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

interface ReasonKeys {
  readonly labelKey: string;
  readonly consequenceKey: string;
}

/**
 * Every published code, as a `Record` rather than a bare array: a value added to
 * the enum on the next regeneration fails the type check here rather than
 * silently disappearing from the list.
 */
const REASON_KEYS: Record<CrewOfferDeclineReasonCode, ReasonKeys> = {
  RATE_TOO_LOW: {
    labelKey: "work.crewOfferDeclineReasons.rateTooLow.label",
    consequenceKey: "work.crewOfferDeclineReasons.rateTooLow.consequence",
  },
  NO_CREW_AVAILABLE: {
    labelKey: "work.crewOfferDeclineReasons.noCrewAvailable.label",
    consequenceKey: "work.crewOfferDeclineReasons.noCrewAvailable.consequence",
  },
  TOO_FAR: {
    labelKey: "work.crewOfferDeclineReasons.tooFar.label",
    consequenceKey: "work.crewOfferDeclineReasons.tooFar.consequence",
  },
  SITE_UNSUITABLE: {
    labelKey: "work.crewOfferDeclineReasons.siteUnsuitable.label",
    consequenceKey: "work.crewOfferDeclineReasons.siteUnsuitable.consequence",
  },
  OTHER: {
    labelKey: "work.crewOfferDeclineReasons.other.label",
    consequenceKey: "work.crewOfferDeclineReasons.other.consequence",
  },
};

/**
 * Reading order: the answer that changes the rate first.
 *
 * A ranking, never the list itself — the list is derived from `REASON_KEYS`'s
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

/** Every published code, in reading order. No locale text needed to validate one. */
export const CREW_OFFER_DECLINE_REASON_CODES: readonly CrewOfferDeclineReasonCode[] = (
  Object.keys(REASON_KEYS) as CrewOfferDeclineReasonCode[]
).sort((left, right) => rankOf(left) - rankOf(right));

/** The full tile list, worded in the caller's locale. */
export function getCrewOfferDeclineReasons(
  t: ReturnType<typeof useT>,
): readonly CrewOfferDeclineReason[] {
  return CREW_OFFER_DECLINE_REASON_CODES.map((code) => ({
    code,
    label: t(REASON_KEYS[code].labelKey),
    consequence: t(REASON_KEYS[code].consequenceKey),
  }));
}

export function findCrewOfferDeclineReason(
  code: string,
  t: ReturnType<typeof useT>,
): CrewOfferDeclineReason | null {
  const match = CREW_OFFER_DECLINE_REASON_CODES.find((known) => known === code) ?? null;
  if (match === null) return null;
  return {
    code: match,
    label: t(REASON_KEYS[match].labelKey),
    consequence: t(REASON_KEYS[match].consequenceKey),
  };
}

/**
 * Narrows a free string to a published code, or nothing. A miss means the enum
 * moved under the bundle, and posting an unpublished code earns a `400`. No
 * locale text is needed to check membership, so this takes no `t`.
 */
export function asCrewOfferDeclineReasonCode(code: string): CrewOfferDeclineReasonCode | null {
  return CREW_OFFER_DECLINE_REASON_CODES.find((known) => known === code) ?? null;
}
