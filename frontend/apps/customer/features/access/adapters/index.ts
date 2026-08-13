import {
  canConfirmArrival,
  canReportVendorNoShow,
  isOutOfBudget,
  readVendorIdentity,
  visitSlotState,
  type CustomerProposal,
  type QuoteTeaser,
  type QuoteTeaserList,
  type SiteVisit,
  type VisitPlan,
  type VisitPlanShare,
  type VisitPlanState,
  type VisitPlanTier,
  type VisitSlotState,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

import { BOOKING_TIME_ZONE } from "@/features/booking/adapters";

/**
 * The only code in the access feature that knows what the wire looks like.
 *
 * Same layering as `features/requirement/adapters/`: `view/` and `model/`
 * consume the shapes below and never the generated client, so the next contract
 * change is one file rather than six screens.
 */

/* --------------------------------------------------------------------------
   Slot times, in the checkout picker's presentation
   -------------------------------------------------------------------------- */

/**
 * A confirmed visit time, formatted exactly as the checkout slot picker formats
 * a chosen start.
 *
 * `M2-FE-421` requires the checkout picker's presentation rather than a second
 * one, and the reason is stronger than consistency: an A5 visit slot is booked
 * against the **same `carts.availability` grid** the A1 checkout books against,
 * through the same window loop. Two formatters over one grid is how a Customer
 * ends up reading "Tue 10:00" on one screen and "10 am Tuesday" on another for
 * the same reservation.
 *
 * The parts are lifted from `features/booking/adapters/windows.ts`: `en-IN`,
 * weekday/day/month for the day, `hour12` lowercased for the time, and the
 * booking timezone rather than the device's — a Customer travelling must not see
 * their visit move.
 *
 * The zone is the deprecated constant because a `SiteVisit` publishes no
 * timezone of its own, unlike `BookingWindows`. Requesting one is logged in
 * `frontend-execution-plan.md` §7; until then this is the same fallback every
 * other caller without a response uses.
 */
const VISIT_DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: BOOKING_TIME_ZONE,
});

const VISIT_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: BOOKING_TIME_ZONE,
});

export function formatVisitSlot(instant: string | null): string | null {
  if (instant === null) return null;
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  return `${VISIT_DAY_FORMAT.format(at)}, ${VISIT_TIME_FORMAT.format(at).toLowerCase()}`;
}

/* --------------------------------------------------------------------------
   A3 teasers — `M2-FE-401`, `M2-FE-405`
   -------------------------------------------------------------------------- */

/**
 * One teaser, as much of a quote as an unpaid Customer is entitled to see.
 *
 * `M2-FE-401` also asks for a **rating**, and `QuoteTeaser` publishes none —
 * `{proposal_id, vendor_type, is_verified, price_band_low_paise,
 * price_band_high_paise, is_out_of_budget}` is the whole shape. It is absent
 * here rather than filled with a star count this client would be inventing.
 * Logged in `frontend-execution-plan.md` §7.
 */
export interface TeaserView {
  proposalId: string;
  /** `AGENCY`, `INDIVIDUAL`… the server's own vocabulary, shown as it arrives. */
  vendorType: string;
  isVerified: boolean;
  /** The band, never a price. A single number here would be the quote itself. */
  bandLabel: string;
  isOutOfBudget: boolean;
}

/**
 * The price band as one label.
 *
 * Collapses to a single figure when the band has no width — a vendor who quoted
 * one number gets "₹4,000", not "₹4,000 – ₹4,000", which reads as an estimate
 * nobody made.
 */
function bandLabel(low: number, high: number): string {
  return low === high ? formatMoney(low) : `${formatMoney(low)} – ${formatMoney(high)}`;
}

export function toTeaserView(teaser: QuoteTeaser): TeaserView {
  return {
    proposalId: teaser.proposal_id,
    vendorType: teaser.vendor_type,
    isVerified: teaser.is_verified,
    bandLabel: bandLabel(teaser.price_band_low_paise, teaser.price_band_high_paise),
    isOutOfBudget: teaser.is_out_of_budget,
  };
}

export interface TeaserListView {
  teasers: readonly TeaserView[];
  usableQuoteCount: number;
  /**
   * The server's own purchase guard, mirrored so the control can be disabled.
   *
   * Never trusted as permission. `POST .../unlock/` re-checks independently,
   * because a stale `true` is the state a duplicate purchase lives in.
   */
  unlockAvailable: boolean;
}

export function toTeaserListView(list: QuoteTeaserList): TeaserListView {
  return {
    teasers: list.teasers.map(toTeaserView),
    usableQuoteCount: list.usable_quote_count,
    unlockAvailable: list.unlock_available,
  };
}

/* --------------------------------------------------------------------------
   A5 tiers — `M2-FE-216`
   -------------------------------------------------------------------------- */

export interface PlanTierView {
  planSize: number;
  priceLabel: string;
  pricePaise: number;
  /** "One professional visits", "Two professionals visit"… */
  headline: string;
}

const TIER_HEADLINE: Record<number, string> = {
  1: "One professional visits",
  2: "Two professionals visit",
  3: "Three professionals visit",
};

export function toPlanTierViews(tiers: readonly VisitPlanTier[]): readonly PlanTierView[] {
  return [...tiers]
    .sort((left, right) => left.plan_size - right.plan_size)
    .map((tier) => ({
      planSize: tier.plan_size,
      pricePaise: tier.price_paise,
      priceLabel: formatMoney(tier.price_paise),
      // A size the server publishes and this build has no sentence for still
      // renders, counted rather than named. The tier list is owner
      // configuration and a fourth size must not make the chooser disappear.
      headline: TIER_HEADLINE[tier.plan_size] ?? `${tier.plan_size} professionals visit`,
    }));
}

/* --------------------------------------------------------------------------
   The visit tracker — `M2-FE-421`, `M2-FE-422`, `M2-FE-424`
   -------------------------------------------------------------------------- */

/**
 * What one slot's money did, in the server's own arithmetic.
 *
 * `M2-FE-424`: shown truthfully and **never computed here**. Each share carries
 * `amount_paise`, `vendor_payout_paise` and `platform_share_paise` in integer
 * paise, and the only thing this layer does is choose which of them the sentence
 * is about.
 */
export type SlotMoneyKind =
  /** Nothing has been committed against this slot. */
  | "unspent"
  /** A vendor holds it; the money is committed and not yet earned. */
  | "committed"
  /** Visit completed and an estimate landed — the professional is paid. */
  | "earned"
  /** Returned to the Customer whole. Neither party earns from a visit that did not deliver. */
  | "refunded"
  /** Owed as a free replacement visit rather than as money. */
  | "replaced";

export interface SlotMoneyView {
  kind: SlotMoneyKind;
  /** The share of the plan this slot represents. */
  amountLabel: string;
  /** What the visiting professional is paid. Null except when earned. */
  vendorPayoutLabel: string | null;
}

const SHARE_MONEY_KIND: Record<VisitPlanShare["status"], SlotMoneyKind> = {
  OPEN: "unspent",
  COMMITTED: "committed",
  EARNED: "earned",
  REFUNDED: "refunded",
  REPLACED: "replaced",
};

function toSlotMoney(share: VisitPlanShare): SlotMoneyView {
  const kind = SHARE_MONEY_KIND[share.status] ?? "unspent";
  return {
    kind,
    amountLabel: formatMoney(share.amount_paise),
    vendorPayoutLabel: kind === "earned" ? formatMoney(share.vendor_payout_paise) : null,
  };
}

/**
 * One row of the visit tracker.
 *
 * The list is driven by the plan's **shares**, not by its visits: the shares are
 * the slots the Customer chose and paid for, and a slot nobody has taken yet is
 * exactly the row `M2-FE-421` calls "awaiting". Driving it from visits would
 * make an unfilled slot vanish, which is the one row whose refund the Customer
 * most needs to see.
 */
export interface VisitSlotRow {
  /** Stable across refetches: the share's own id. */
  id: string;
  /** The server's own 1-based slot number (`_create_shares` enumerates from 1). */
  position: number;
  /** `null` while no vendor has taken this slot. */
  visitId: string | null;
  state: VisitSlotState | "awaiting";
  scheduledFor: string | null;
  /**
   * The professional's name, once we are entitled to publish it.
   *
   * Disclosure is per vendor and starts at slot confirmation — someone entering
   * a home must be nameable. **The visit read carries no vendor at all**
   * (`SiteVisit` publishes no partner and `VendorCardSerializer` is published on
   * no path), so the only identity this app can reach is the one on a delivered
   * estimate. A slot with a confirmed time and no estimate yet therefore has no
   * name here, and the row says so rather than inventing one. Logged in
   * `frontend-execution-plan.md` §7.
   */
  vendorName: string | null;
  money: SlotMoneyView;
  /** When a completed visit stops being allowed to produce an estimate. */
  estimateDueAt: string | null;
  canConfirmArrival: boolean;
  canReportNoShow: boolean;
}

export interface VisitTrackerView {
  rows: readonly VisitSlotRow[];
  planSize: number;
  /** What the whole plan cost, from the plan record. Never summed here. */
  priceLabel: string;
  /** True once a verified callback has charged it. */
  isCharged: boolean;
  /** Slots still waiting for a professional to take them. */
  openSlots: number;
  /** When the plan must be filled by, or null when the owner set no SLA. */
  fillDueAt: string | null;
}

/**
 * Which estimate came from which visit.
 *
 * `CustomerProposal.site_visit` is the link and it is the only one published.
 * Built as a map rather than searched per row so a plan of three does not
 * re-scan the quote list three times, and so a proposal whose visit is null —
 * every A3 quote — contributes nothing.
 */
export function vendorNamesByVisit(
  proposals: readonly CustomerProposal[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const proposal of proposals) {
    const visit = proposal.site_visit;
    if (visit === null) continue;
    const identity = readVendorIdentity(proposal.vendor);
    if (identity.displayName === null) continue;
    names.set(visit.id, identity.displayName);
  }
  return names;
}

export function toVisitTrackerView(
  state: VisitPlanState,
  vendorNames: ReadonlyMap<string, string> = new Map(),
): VisitTrackerView | null {
  const plan: VisitPlan | null = state.plan;
  if (plan === null) return null;

  const isCharged = plan.status === "ACTIVE" || plan.status === "SETTLED";
  const visits: readonly SiteVisit[] = state.visits;

  const rows = plan.shares.map((share, index): VisitSlotRow => {
    // Shares and visits are two lists describing the same slots and the server
    // publishes no key between them, so position is the join — the same
    // position the plan's own `price / size` arithmetic is defined on. A slot
    // with no visit yet is the ordinary pre-fill state, not a mismatch.
    const visit = visits[index] ?? null;
    return {
      id: share.id,
      position: share.position,
      visitId: visit?.id ?? null,
      state: visit === null ? "awaiting" : visitSlotState(visit, isCharged),
      scheduledFor: visit?.scheduled_for ?? null,
      vendorName: visit === null ? null : (vendorNames.get(visit.id) ?? null),
      money: toSlotMoney(share),
      estimateDueAt: visit?.estimate_due_at ?? null,
      canConfirmArrival: visit !== null && canConfirmArrival(visit, isCharged),
      canReportNoShow: visit !== null && canReportVendorNoShow(visit, isCharged),
    };
  });

  return {
    rows,
    planSize: plan.plan_size,
    priceLabel: formatMoney(plan.price_paise),
    isCharged,
    openSlots: rows.filter((row) => row.state === "awaiting").length,
    fillDueAt: plan.fill_due_at,
  };
}

/**
 * What the Customer still owes for the plan.
 *
 * `chargeable_paise` rather than `price_paise`: a reclassified A3 request
 * carries its unlock across as visit-plan credit, and the checkout screen must
 * quote what is actually being taken. Both are published; the server decides
 * which is which and this only reads the right one.
 */
export interface PlanCheckoutView {
  planId: string;
  planSize: number;
  priceLabel: string;
  creditLabel: string | null;
  chargeableLabel: string;
  /** Slots that will refund themselves if nobody fills them. */
  openSlots: number;
}

export function toPlanCheckoutView(state: VisitPlanState): PlanCheckoutView | null {
  const plan = state.plan;
  if (plan === null) return null;
  return {
    planId: plan.id,
    planSize: plan.plan_size,
    priceLabel: formatMoney(plan.price_paise),
    creditLabel: plan.credit_paise > 0 ? formatMoney(plan.credit_paise) : null,
    chargeableLabel: formatMoney(plan.chargeable_paise),
    openSlots: plan.shares.filter((share) => share.status === "OPEN").length,
  };
}

/* --------------------------------------------------------------------------
   Shared
   -------------------------------------------------------------------------- */

/** The unlock's price, or null when Operations has loaded none. Never a literal. */
export function unlockPriceLabel(pricePaise: number | null): string | null {
  return pricePaise === null ? null : formatMoney(pricePaise);
}

/** Out-of-budget, as the quotes screen labels it. Re-exported so `view/` need not import the wire. */
export function proposalIsOutOfBudget(proposal: CustomerProposal): boolean {
  return isOutOfBudget(proposal);
}
