import type {
  InstantRefusalReason,
  ProposedInstantPreCheck,
} from "../contract-pending/types";

/**
 * The Instant pool pre-check becomes a decision the customer can act on.
 *
 * Two rules shape this file.
 *
 * **The trust rule (doc 11 §4).** "You have not been charged" is true only for
 * the three pre-payment refusal codes. Every outcome this adapter produces is
 * pre-payment by definition — the pre-check runs before the pay action — so the
 * reassurance is safe here and is stated. It is forbidden after payment, where
 * `NO_PARTNER_CONFIRMED` must say what is actually true about the money. That
 * screen belongs to B6 and must not reuse this adapter.
 *
 * **Distinct recovery per code.** Doc 11 §2.2 requires an out-of-hours request
 * to be refused with the operating-window message rather than by an empty
 * search. Collapsing these into one "not available" message would send a
 * customer who needs to come back at 9am to retry instead.
 */

export type PreCheckAction = "switch_to_scheduled" | "retry" | "change_address";

export interface PreCheckView {
  canDispatch: boolean;
  /** "No professional is available near you right now." */
  headline: string;
  /** Server-authored detail where it exists, otherwise our own explanation. */
  detail: string | null;
  /** Safe here, and only here — see the trust rule above. */
  reassurance: string | null;
  primaryAction: PreCheckAction | null;
  /** "Usually 25–40 minutes" — text only, never a countdown (ADR-013/ADR-030). */
  arrivalText: string | null;
}

const REFUSALS: Record<
  InstantRefusalReason,
  { headline: string; detail: string; action: PreCheckAction }
> = {
  ELIGIBLE_POOL_EXHAUSTED: {
    headline: "No professional is available near you right now",
    detail: "Booking a time slot instead usually works, even for later today.",
    action: "switch_to_scheduled",
  },
  INSTANT_UNAVAILABLE: {
    headline: "Instant booking is temporarily unavailable",
    detail: "This is on our side, not yours. Scheduled booking is working normally.",
    action: "switch_to_scheduled",
  },
  OUTSIDE_OPERATING_WINDOW: {
    // The hours themselves come from the server's `message`, because the
    // frontend does not know the operating window for this area.
    headline: "Instant booking is closed in your area right now",
    detail: "Book a time slot and a professional will come during service hours.",
    action: "switch_to_scheduled",
  },
  AREA_NOT_SERVICEABLE: {
    headline: "We do not cover this address yet",
    detail: "Check the address, or try a different one you have saved.",
    action: "change_address",
  },
};

export function toPreCheckView(response: ProposedInstantPreCheck): PreCheckView {
  if (response.can_dispatch) {
    return {
      canDispatch: true,
      headline: "A professional is available now",
      detail: null,
      reassurance: null,
      primaryAction: null,
      arrivalText: response.estimated_arrival_text,
    };
  }

  const refusal = response.reason_code ? REFUSALS[response.reason_code] : null;

  return {
    canDispatch: false,
    headline: refusal?.headline ?? "Instant booking is not available right now",
    // Server copy wins when present: it carries the operating hours, which we
    // cannot state ourselves.
    detail: response.message ?? refusal?.detail ?? null,
    reassurance: "You have not been charged.",
    primaryAction: refusal?.action ?? "switch_to_scheduled",
    arrivalText: null,
  };
}
