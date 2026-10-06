// Ported from frontend/apps/customer/features/booking/contract-pending/types.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * Proposed response shapes for endpoints the contract does not publish yet.
 *
 * See ./README.md before adding anything here, and
 * `contracts/proposals/0003-m1-booking-and-contract-drift.md` for the request
 * that these become real. Nothing outside `../adapters/` may import this module.
 *
 * Reused published types (`Money`) are imported rather than redeclared, so the
 * parts that *are* settled stay bound to the contract and only the
 * genuinely-unknown parts are guesses.
 */

type Money = Schemas["Money"];

/** ISO 8601 instant, as every published date-time field already is. */
type Instant = string;

// ---------------------------------------------------------------------------
// 1. Arrival windows — proposal 0003 §B1
// ---------------------------------------------------------------------------

/** Why a returned window cannot be booked. Shown as disabled, never hidden. */
export type WindowUnavailableReason =
  | "NO_CAPACITY"
  | "OUTSIDE_OPERATING_WINDOW"
  | "TOO_SOON"
  | "PAST";

export interface ProposedWindow {
  /**
   * Opaque. The frontend never builds one from a date and a time — that is how
   * a UI ends up offering a window the backend never published.
   */
  id: string;
  starts_at: Instant;
  ends_at: Instant;
  is_available: boolean;
  unavailable_reason?: WindowUnavailableReason;
}

export interface ProposedWindowDay {
  /** Calendar date in the service area's timezone, `YYYY-MM-DD`. */
  date: string;
  is_today: boolean;
  has_availability: boolean;
  windows: ProposedWindow[];
}

export interface ProposedWindows {
  server_now: Instant;
  /** Derived by the server from the chosen task lines. Display only (ADR-008). */
  estimated_duration_minutes: number;
  days: ProposedWindowDay[];
}

// ---------------------------------------------------------------------------
// 2. Quote — proposal 0003 §B2
// ---------------------------------------------------------------------------

export interface ProposedQuoteLine {
  code: string;
  label: string;
  amount: Money;
}

export interface ProposedLabelledAmount {
  label: string;
  amount: Money;
}

/**
 * One band of the cancellation ladder, in rupees for this booking.
 *
 * The M1 configuration freezes these as fixed fees (₹0 / ₹49 / ₹99 / ₹149), not
 * percentages, and requires them visible before search and payment. They arrive
 * pre-computed because deriving them client-side would be the frontend
 * computing a price.
 */
export interface ProposedCancellationBand {
  code: string;
  /** Server-authored. The frontend does not compose policy language. */
  condition_text: string;
  fee: Money;
}

export interface ProposedCancellationPolicy {
  policy_version: string;
  bands: ProposedCancellationBand[];
}

export interface ProposedQuote {
  id: string;
  version: number;
  expires_at: Instant;
  server_now: Instant;
  estimated_duration_minutes: number;
  lines: ProposedQuoteLine[];
  subtotal: Money;
  platform_fee: ProposedLabelledAmount;
  tax: ProposedLabelledAmount;
  total: Money;
  cancellation_policy: ProposedCancellationPolicy;
}

// ---------------------------------------------------------------------------
// 3. Checkout session — proposal 0003 §B3
// ---------------------------------------------------------------------------

/**
 * The checkout lifecycle from
 * [03 §Checkout lifecycle](../../../../../../Django_Next.js_Plan/03-lifecycle-and-state-machines.md).
 *
 * `FINDING_PARTNER` and `PARTNER_COMMITTED` both precede `PAYMENT_PENDING`,
 * which is the M1 ordering rule (ADR-012) expressed as data.
 */
export type ProposedCheckoutStatus =
  | "CREATED"
  | "FINDING_PARTNER"
  | "PARTNER_COMMITTED"
  | "PAYMENT_PENDING"
  | "COMPLETED"
  | "EXPIRED"
  | "FAILED"
  | "CANCELLED";

/** Disclosed only at `PARTNER_COMMITTED`. Absent during the search. */
export interface ProposedCommittedPartner {
  display_name: string;
  photo_url: string | null;
  skill_badge: string;
}

export interface ProposedNoPartnerAlternative {
  code: string;
  /** Server-authored: "Try tomorrow morning", "Choose a wider window". */
  label: string;
}

export interface ProposedCheckoutSession {
  reference: string;
  status: ProposedCheckoutStatus;
  server_now: Instant;
  /** Whole-search deadline, 180s. Null once the search has ended. */
  search_deadline_at: Instant | null;
  /**
   * Null until `PARTNER_COMMITTED`.
   *
   * An offer is not a commitment, and a declined offer must not leak a name, so
   * there is nothing to show during `FINDING_PARTNER`.
   */
  partner: ProposedCommittedPartner | null;
  /** End of the Partner's 120s no-fault undo window. Null until committed. */
  payment_enabled_at: Instant | null;
  /** Tentative reservation expiry, 5 minutes. Null until committed. */
  reservation_expires_at: Instant | null;
  no_partner_alternatives: ProposedNoPartnerAlternative[];
}

// ---------------------------------------------------------------------------
// 4. Cart — proposal 0003 §B4
// ---------------------------------------------------------------------------

/**
 * One answer to one configured question.
 *
 * `value` is heterogeneous by question kind — number, boolean, string, or option
 * codes for MULTIPLE_CHOICE — so it stays `unknown` and is narrowed at the point
 * of use against the question's published `kind`.
 */
export interface ProposedScopeAnswer {
  question_code: string;
  value: unknown;
}

export interface ProposedTaskLine {
  task_code: string;
  quantity: number;
}

export interface ProposedCartItem {
  id: string;
  service_variant_id: string;
  service_slug: string;
  task_lines: ProposedTaskLine[];
  address_id: string | null;
  window_id: string | null;
  scope: ProposedScopeAnswer[];
  notes: string;
}

export interface ProposedCart {
  id: string;
  items: ProposedCartItem[];
  server_now: Instant;
}
