// Ported from frontend/apps/customer/features/access/adapters/index.ts
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
} from "@vsolve/query/native";
import { formatMoney } from "@vsolve/mobile-ui";

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
 * **The zone is the visit's own, since contract 1.26.0.** `SiteVisit.timezone`
 * publishes the service area's zone — the same thing `BookingWindows` publishes
 * for the A1 grid — and until it landed this fell back to the deprecated
 * Hyderabad-only constant, which was correct only while the platform had one
 * city. `toWindowsView` makes exactly this read on the A1 side; a row with no
 * zone in hand still falls back rather than rendering the device's, because a
 * Customer travelling must not watch their visit move.
 *
 * Formatters are memoised per zone the way `formattersFor` is: constructing an
 * `Intl.DateTimeFormat` per row is measurable on a three-slot tracker that
 * re-renders on every poll.
 */
interface VisitFormatters {
  day: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
}

const VISIT_FORMATTERS = new Map<string, VisitFormatters>();

function buildVisitFormatters(timeZone: string): VisitFormatters {
  return {
    day: new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }),
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }),
  };
}

function visitFormattersFor(timeZone: string): VisitFormatters {
  const cached = VISIT_FORMATTERS.get(timeZone);
  if (cached !== undefined) return cached;
  let formatters: VisitFormatters;
  try {
    formatters = buildVisitFormatters(timeZone);
  } catch {
    // `Intl.DateTimeFormat` throws `RangeError` on a zone it does not know, and
    // the alternative to catching it is a blank visit tracker. The fallback is
    // the booking zone, never the device's — a Customer travelling must not
    // watch their visit move.
    formatters = buildVisitFormatters(BOOKING_TIME_ZONE);
  }
  VISIT_FORMATTERS.set(timeZone, formatters);
  return formatters;
}

export function formatVisitSlot(
  instant: string | null,
  timeZone: string | null = null,
): string | null {
  if (instant === null) return null;
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  return visitSlotLabel(at, timeZone);
}

function visitSlotLabel(at: Date, timeZone: string | null): string {
  const formatters = visitFormattersFor(
    timeZone !== null && timeZone.trim() !== "" ? timeZone : BOOKING_TIME_ZONE,
  );
  return `${formatters.day.format(at)}, ${formatters.time.format(at).toLowerCase()}`;
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
  /**
   * `"awaiting"` is still searching; `"unmatched"` is the server's own
   * `NO_PROFESSIONAL_FOUND`, and `"dropped"` is a slot the Customer chose to do
   * without. The last two used to collapse into `"awaiting"`, which is how a
   * settled dead end rendered as a spinner that never stopped.
   */
  state: VisitSlotState | "awaiting" | "unmatched" | "dropped";
  scheduledFor: string | null;
  /**
   * The service area's own zone, from `SiteVisit.timezone` (contract 1.26.0).
   *
   * Null until a vendor has taken the slot, because the zone is published on the
   * visit rather than on the plan. `formatVisitSlot` falls back to the booking
   * zone for that row, which is the same fallback the A1 grid uses.
   */
  timeZone: string | null;
  /**
   * The professional's name, once we are entitled to publish it.
   *
   * Disclosure is per vendor and starts at slot confirmation — someone entering
   * a home must be nameable.
   *
   * This used to be reachable only through a *delivered estimate*, because the
   * visit read published no vendor at all, so a confirmed slot with nobody
   * named on it was the ordinary case: the screen whose whole job is to say who
   * is about to knock on the door was the one screen that could not say. The
   * visit now publishes its own vendor (contract 1.39.0), and the estimate map
   * is kept only as a fallback for a visit whose disclosure window has not
   * opened but whose estimate has already landed.
   */
  vendorName: string | null;
  /**
   * Everything else about the professional, or null before disclosure.
   *
   * A single nullable object rather than four nullable fields, because they are
   * one fact — "we are allowed to say who this is" — and four flags can
   * represent states that do not exist, like a photograph with no name.
   */
  vendor: VisitVendorView | null;
  money: SlotMoneyView;
  /** When a completed visit stops being allowed to produce an estimate. */
  estimateDueAt: string | null;
  canConfirmArrival: boolean;
  canReportNoShow: boolean;
}

/**
 * The professional on a confirmed visit, as a screen needs them.
 *
 * `photoUrl` is a short-lived signed link and is null for four different server
 * reasons — no photograph, one in review, one refused, storage unreachable. They
 * are collapsed deliberately: every one of them renders as initials, and a
 * client that told them apart would be describing a partner's review status to
 * a Customer.
 */
export interface VisitVendorView {
  displayName: string;
  businessType: string;
  isVerified: boolean;
  experienceYears: number;
  photoUrl: string | null;
  /** What the avatar falls back to. Derived from the real name, never invented. */
  initials: string;
}

/**
 * Up to two letters from a name, for the avatar that has no photograph.
 *
 * Not a placeholder in the sense this codebase forbids: it is a rendering of the
 * vendor's actual name, not stand-in data. A name that yields nothing — all
 * punctuation, an empty string the server should never send — gives an empty
 * string back, and the avatar draws its neutral shape rather than a stray glyph.
 */
export function vendorInitials(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length > 0);
  if (words.length === 0) return "";
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

function toVendorView(visit: SiteVisit | null): VisitVendorView | null {
  const vendor = visit?.vendor ?? null;
  if (vendor === null) return null;
  return {
    displayName: vendor.display_name,
    businessType: vendor.business_type,
    isVerified: vendor.is_verified,
    experienceYears: vendor.experience_years,
    photoUrl: vendor.photo_url,
    initials: vendorInitials(vendor.display_name),
  };
}

export interface VisitTrackerView {
  rows: readonly VisitSlotRow[];
  /** How many slots are waiting on the Customer to re-time or drop them. */
  unmatchedSlots: number;
  /** Slots the Customer chose to do without. Shown, never silently removed. */
  droppedSlots: number;
  /** What the plan still buys — `planSize` less the dropped slots. */
  liveSlots: number;
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
      // The share's own matching state decides an empty slot, not the absence
      // of a visit. Reading only `visit === null` made every unfilled slot
      // "searching" — including the ones the server had already settled as
      // having nobody to find, which is exactly the slot a Customer most needs
      // an answer about.
      state:
        visit !== null
          ? visitSlotState(visit, isCharged)
          : share.status === "REFUNDED"
            ? "dropped"
            : share.matching_status === "NO_PROFESSIONAL_FOUND"
              ? "unmatched"
              : "awaiting",
      scheduledFor: visit?.scheduled_for ?? null,
      timeZone: visit?.timezone ?? null,
      // The visit's own vendor first; the estimate map only as the fallback it
      // now is. Preferring the map would keep showing the estimate-derived name
      // on a visit the server has already disclosed properly.
      vendorName:
        visit === null
          ? null
          : (visit.vendor?.display_name ?? vendorNames.get(visit.id) ?? null),
      vendor: toVendorView(visit),
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
    /** Slots the server has given up on and the Customer has not yet answered. */
    unmatchedSlots: rows.filter((row) => row.state === "unmatched").length,
    droppedSlots: rows.filter((row) => row.state === "dropped").length,
    liveSlots: rows.filter((row) => row.state !== "dropped").length,
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

/**
 * The visit day split into the three parts a calendar tile shows.
 *
 * Formatted in the *service area's* zone, not the device's, for the same reason
 * `formatVisitSlot` is: a Customer travelling has not moved their bathroom, and
 * a tile reading Friday for a Saturday visit is the kind of error nobody
 * double-checks. Null all the way through when there is no confirmed time or
 * the zone the server sent is one this device does not know — the tile is then
 * simply absent, and the line beside it still says so in words.
 */
export function calendarDay(
  scheduledFor: string | null,
  timeZone: string | null,
): { weekday: string; dayOfMonth: string; month: string } | null {
  if (scheduledFor === null) return null;
  const at = new Date(scheduledFor);
  if (Number.isNaN(at.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(timeZone === null ? {} : { timeZone }),
    }).formatToParts(at);

    const find = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? null;

    const weekday = find("weekday");
    const dayOfMonth = find("day");
    const month = find("month");
    if (weekday === null || dayOfMonth === null || month === null) return null;
    return { weekday, dayOfMonth, month };
  } catch {
    // An unknown IANA zone throws rather than falling back, and a thrown format
    // must not take the whole visit page down with it.
    return null;
  }
}
