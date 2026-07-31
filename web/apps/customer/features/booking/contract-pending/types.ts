import type { Schemas } from "@vsolve/api-client";

/**
 * Proposed response shapes for endpoints the contract does not publish yet.
 *
 * See ./README.md before adding anything here, and
 * `contracts/proposals/0002-booking-workspace.md` for the request that these
 * become real. Nothing outside `../adapters/` may import this module.
 *
 * Reused published types (`Money`, and the enums) are imported rather than
 * redeclared, so the parts that *are* settled stay bound to the contract and
 * only the genuinely-unknown parts are guesses.
 */

type Money = Schemas["Money"];

/** ISO 8601 instant, as every published date-time field already is. */
type Instant = string;

/**
 * Instant versus Scheduled. Per item rather than per cart, because doc 10 §14
 * forbids mixing them in one checkout while keeping other items in the cart.
 */
export type FulfilmentType = "INSTANT" | "SCHEDULED";

// ---------------------------------------------------------------------------
// 1. Scheduled availability
// ---------------------------------------------------------------------------

/** Why a returned window cannot be booked. Shown as disabled, never hidden. */
export type SlotUnavailableReason =
  | "FULLY_BOOKED"
  | "OUTSIDE_OPERATING_WINDOW"
  | "TOO_SOON"
  | "PAST";

export interface ProposedSlot {
  /**
   * Opaque. The frontend never builds one from a date and a time — that is how
   * a UI ends up offering a window the backend never published.
   */
  id: string;
  start_at: Instant;
  end_at: Instant;
  is_available: boolean;
  unavailable_reason?: SlotUnavailableReason;
}

export interface ProposedAvailabilityDay {
  /** Calendar date in the service area's timezone, `YYYY-MM-DD`. */
  date: string;
  has_availability: boolean;
  slots: ProposedSlot[];
}

export interface ProposedAvailability {
  server_now: Instant;
  days: ProposedAvailabilityDay[];
}

// ---------------------------------------------------------------------------
// 2. Eligible Partners — Scheduled only
// ---------------------------------------------------------------------------

export interface ProposedEligiblePartner {
  id: string;
  display_name: string;
  photo_url: string | null;
  /** Decimal string, matching how `Address.latitude` is already published. */
  rating: string;
  rating_count: number;
  completed_jobs: number;
  skill_badge: string;
  previously_booked: boolean;
  /**
   * Null means this Partner costs the same. The UI then shows no price text at
   * all — "₹0 extra" reads as a fee.
   */
  price_difference: Money | null;
  /** Server-authored. The frontend does not compose arrival language. */
  availability_text: string;
}

export interface ProposedEligiblePartners {
  server_now: Instant;
  auto_assign_available: boolean;
  partners: ProposedEligiblePartner[];
}

// ---------------------------------------------------------------------------
// 3. Capacity hold — Scheduled only
// ---------------------------------------------------------------------------

export interface ProposedCapacityHold {
  id: string;
  cart_item_id: string;
  /** Populated even when Auto Assign was requested, so review can name someone. */
  partner_id: string | null;
  slot_id: string;
  expires_at: Instant;
  server_now: Instant;
}

// ---------------------------------------------------------------------------
// 4. Instant eligible-pool pre-check
// ---------------------------------------------------------------------------

/**
 * Doc 11 §4's pre-payment outcomes. These stay distinct because each has a
 * different recovery: an operating-window refusal offers Scheduled with the
 * hours named, while an exhausted pool offers a retry or Scheduled. Doc 11 §2.2
 * is explicit that a 2 AM request in an area closing at 10 PM is refused here
 * and not by an empty search later.
 */
export type InstantRefusalReason =
  | "ELIGIBLE_POOL_EXHAUSTED"
  | "INSTANT_UNAVAILABLE"
  | "OUTSIDE_OPERATING_WINDOW"
  | "AREA_NOT_SERVICEABLE";

export interface ProposedInstantPreCheck {
  server_now: Instant;
  can_dispatch: boolean;
  reason_code: InstantRefusalReason | null;
  /**
   * Text, per ADR-013/ADR-030. Never a timestamp the UI could turn into a
   * countdown, and never coordinates.
   */
  estimated_arrival_text: string | null;
  /** Server-authored; carries the operating hours the frontend does not know. */
  message?: string;
}

// ---------------------------------------------------------------------------
// 5. Quote
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
 * One band of the graduated cancellation ladder, in rupees for this booking.
 *
 * Doc 11 §5.1/§5.3 requires concrete amounts before the pay action. They arrive
 * pre-computed because deriving them from percentages client-side would be the
 * frontend computing a price.
 */
export interface ProposedCancellationBand {
  code: string;
  /** Server-authored: the bands differ between Instant and Scheduled. */
  condition_text: string;
  refund_amount: Money;
  fee_amount: Money;
}

export interface ProposedCancellationLadder {
  policy_version: string;
  bands: ProposedCancellationBand[];
}

export interface ProposedQuote {
  id: string;
  version: number;
  expires_at: Instant;
  server_now: Instant;
  fulfilment_type: FulfilmentType;
  lines: ProposedQuoteLine[];
  subtotal: Money;
  platform_fee: ProposedLabelledAmount;
  tax: ProposedLabelledAmount;
  total: Money;
  cancellation_ladder: ProposedCancellationLadder;
}

// ---------------------------------------------------------------------------
// 6. Cart
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

export interface ProposedCartItem {
  id: string;
  service_variant_id: string;
  service_slug: string;
  fulfilment_type: FulfilmentType;
  /** Same-visit scope quantity (doc 03 §3), never a booking multiplier. */
  quantity: number;
  duration_minutes: number;
  address_id: string | null;
  slot_id: string | null;
  partner_id: string | null;
  capacity_hold_id: string | null;
  scope: ProposedScopeAnswer[];
  notes: string;
}

export interface ProposedCart {
  id: string;
  items: ProposedCartItem[];
  server_now: Instant;
}
