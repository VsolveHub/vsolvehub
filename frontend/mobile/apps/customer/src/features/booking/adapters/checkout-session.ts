// Ported from frontend/apps/customer/features/booking/adapters/checkout-session.ts
import type {
  ProposedCheckoutSession,
  ProposedCheckoutStatus,
} from "../contract-pending/types";

/**
 * The checkout session becomes a view model that answers three questions:
 * what is happening, what may the customer do, and when does it run out.
 *
 * The one rule this file exists to enforce is ADR-012: **payment is not
 * reachable until a Partner has committed.** `canPay` is computed here, from
 * server fields only, so no component can decide to enable a pay button on its
 * own.
 */

export type CheckoutPhase =
  /** Nothing has started; the customer is still configuring. */
  | "idle"
  /** Bounded Partner search. Cancellable, nothing charged. */
  | "searching"
  /** A Partner accepted. Payment may or may not be open yet — see `canPay`. */
  | "committed"
  /** Payment is in flight or awaiting webhook confirmation. */
  | "paying"
  /** Booking confirmed. */
  | "confirmed"
  /** Search exhausted, session expired, or payment failed. Recoverable. */
  | "failed";

export interface CheckoutSessionView {
  reference: string;
  phase: CheckoutPhase;
  /** Server instant this snapshot describes. Calibrates every countdown. */
  serverNow: string;

  /**
   * Whether the pay action may be enabled.
   *
   * True only when a Partner has committed, the undo window has closed, and the
   * reservation is not about to expire. Any other combination is false — an
   * enabled pay button in any other state is the failure ADR-012 exists to
   * prevent.
   */
  canPay: boolean;
  /** Why paying is not yet possible, for the disabled-state copy. */
  payBlockedReason: PayBlockedReason | null;

  /** Absolute deadline the view counts down to, or null when nothing is ticking. */
  deadlineAt: string | null;
  /** Which clock `deadlineAt` refers to, so the view can label it correctly. */
  deadlineKind: "search" | "undo" | "reservation" | null;

  /** Null during the search: an offer is not a commitment. */
  partnerName: string | null;
  partnerBadge: string | null;
  partnerPhotoUrl: string | null;

  /** True while cancelling is free — which, in M1, is the entire pre-payment flow. */
  canCancelFree: boolean;

  alternatives: { code: string; label: string }[];
}

export type PayBlockedReason =
  | "NO_PARTNER_YET"
  | "UNDO_WINDOW_OPEN"
  | "RESERVATION_EXPIRING"
  | "ALREADY_PAID"
  | "SESSION_ENDED";

const PHASE_BY_STATUS: Record<ProposedCheckoutStatus, CheckoutPhase> = {
  CREATED: "idle",
  FINDING_PARTNER: "searching",
  PARTNER_COMMITTED: "committed",
  PAYMENT_PENDING: "paying",
  COMPLETED: "confirmed",
  EXPIRED: "failed",
  FAILED: "failed",
  CANCELLED: "failed",
};

/**
 * How close to reservation expiry the pay action is refused.
 *
 * The frozen configuration sets a 30-second payment-start safety margin: a
 * payment begun inside it would likely land after the reservation released,
 * producing a captured payment with no capacity — the exact ambiguity that
 * forces a refund and an Operations case.
 */
const PAYMENT_START_SAFETY_MARGIN_MS = 30_000;

export function toCheckoutSessionView(
  session: ProposedCheckoutSession,
): CheckoutSessionView {
  const phase = PHASE_BY_STATUS[session.status];
  const now = Date.parse(session.server_now);

  const payBlockedReason = computePayBlocked(session, phase, now);

  return {
    reference: session.reference,
    phase,
    serverNow: session.server_now,

    canPay: payBlockedReason === null,
    payBlockedReason,

    ...deadline(session, phase),

    // Disclosure follows the server, not the phase: the field is absent until
    // policy permits it, so there is nothing here to leak early.
    partnerName: session.partner?.display_name ?? null,
    partnerBadge: session.partner?.skill_badge ?? null,
    partnerPhotoUrl: session.partner?.photo_url ?? null,

    // M1 charges nothing before payment succeeds, so every pre-payment exit is
    // free. Stated explicitly rather than assumed, because the copy shown to the
    // customer depends on it.
    canCancelFree: phase === "idle" || phase === "searching" || phase === "committed",

    alternatives: session.no_partner_alternatives.map((alternative) => ({
      code: alternative.code,
      label: alternative.label,
    })),
  };
}

function computePayBlocked(
  session: ProposedCheckoutSession,
  phase: CheckoutPhase,
  now: number,
): PayBlockedReason | null {
  if (phase === "paying" || phase === "confirmed") return "ALREADY_PAID";
  if (phase === "failed") return "SESSION_ENDED";
  if (phase !== "committed") return "NO_PARTNER_YET";

  // A committed status without the timestamps that bound it is treated as not
  // payable. Missing data never resolves in favour of taking money.
  if (session.payment_enabled_at === null) return "UNDO_WINDOW_OPEN";
  if (now < Date.parse(session.payment_enabled_at)) return "UNDO_WINDOW_OPEN";

  if (session.reservation_expires_at === null) return "RESERVATION_EXPIRING";
  if (Date.parse(session.reservation_expires_at) - now <= PAYMENT_START_SAFETY_MARGIN_MS) {
    return "RESERVATION_EXPIRING";
  }

  return null;
}

/** The single deadline worth showing at this phase, and what to call it. */
function deadline(
  session: ProposedCheckoutSession,
  phase: CheckoutPhase,
): Pick<CheckoutSessionView, "deadlineAt" | "deadlineKind"> {
  if (phase === "searching" && session.search_deadline_at !== null) {
    return { deadlineAt: session.search_deadline_at, deadlineKind: "search" };
  }

  if (phase === "committed") {
    const now = Date.parse(session.server_now);
    // While the Partner can still undo, that is the deadline that matters to the
    // customer — it is what gates the pay button. Afterwards, the reservation is.
    if (
      session.payment_enabled_at !== null &&
      now < Date.parse(session.payment_enabled_at)
    ) {
      return { deadlineAt: session.payment_enabled_at, deadlineKind: "undo" };
    }
    if (session.reservation_expires_at !== null) {
      return { deadlineAt: session.reservation_expires_at, deadlineKind: "reservation" };
    }
  }

  return { deadlineAt: null, deadlineKind: null };
}
