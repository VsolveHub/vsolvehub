import type { Schemas } from "@vsolve/api-client";
import type {
  BookingFee,
  RateCardBooking,
  RateCardState,
  RatePreview,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

// Type-only: `toRateTermsView` accepts the engagement's own frozen terms so one
// sheet can explain the rate before booking and after it. This file never
// imports `features/engagement`'s runtime code, only the shape it publishes.
import type { CrewTermsView } from "@/features/engagement/adapters";

/**
 * The only code in the crew feature that knows what the wire looks like.
 *
 * Same layering as `features/requirement/adapters/` and `features/access/
 * adapters/`: `view/` consumes the shapes below and never the generated client,
 * so the next contract change is one file rather than five screens.
 *
 * ## Nothing here computes money
 *
 * Every paise figure on the A3 path is server-calculated and arrives whole:
 * `total_customer_paise = lead_receipt_paise + booking_fee_paise`, and a
 * forfeited fee reconciles as `amount = travel compensation + platform share`.
 * This layer formats and labels. It never multiplies a day rate by a headcount,
 * never derives a share from a percentage and never fills an absent number —
 * because the one thing a rate disclosure may not do is print a figure the
 * server did not send.
 */

/* --------------------------------------------------------------------------
   The published rate — `M2-FE-426`
   -------------------------------------------------------------------------- */

/** One published add-on rate, as the card names it. */
export interface AddOnRateView {
  /** The server's own key, kept so support and Operations can match it up. */
  code: string;
  label: string;
  amountLabel: string;
}

/**
 * A published add-on key, made readable without inventing a label.
 *
 * The card's `add_on_rates` is an Operations-authored map and publishes no
 * display names, so the alternative to this is either a hardcoded dictionary —
 * a second source of truth that goes stale the first time Operations adds a key
 * — or printing `carry_distance_over_50m_per_worker_day` at a Customer. This
 * only removes the unit suffix the column heading already states and turns
 * separators into spaces; every word shown is a word the server sent.
 */
export function humaniseAddOnCode(code: string): string {
  const withoutUnit = code.replace(/_per_worker_day$/, "");
  const spaced = withoutUnit.replace(/_/g, " ").trim();
  return spaced.length === 0 ? code : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toAddOnViews(rates: Readonly<Record<string, number>> | null): readonly AddOnRateView[] {
  if (rates === null) return [];
  return Object.entries(rates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, amountPaise]) => ({
      code,
      label: humaniseAddOnCode(code),
      amountLabel: formatMoney(amountPaise),
    }));
}

/**
 * A `{key: number}` map that arrived through an `unknown` field.
 *
 * `RateCardBooking.add_on_rates` and `.inclusions` are published as `unknown`
 * while `RatePreview` publishes them properly typed — the same JSON, two
 * declarations. Narrowed rather than cast, so a shape this build does not
 * recognise renders as nothing instead of throwing inside a map.
 */
function readRateMap(value: unknown): Readonly<Record<string, number>> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

function readStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Everything the Customer reads **before** booking.
 *
 * `null` when no rate is published, and that is the fail-closed state rather
 * than an empty one: `RateDisclosure` renders the server's own
 * `unavailable_reason` and offers the quote flow instead. There is no branch
 * anywhere in this feature that produces a price without a `rate_card_id` behind
 * it.
 */
export interface RateDisclosureView {
  headcount: number;
  days: number;
  /** One all-inclusive number per worker per standard day. */
  dayRateLabel: string;
  /** The whole booking: headcount x days at the day rate, server-calculated. */
  totalLabel: string;
  /** Paid direct to the lead at day end. Vsolve never holds it. */
  leadReceiptLabel: string;
  /**
   * The same cash for **one** day — what to have ready at the end of each shift.
   *
   * Read from the server rather than divided out of `leadReceiptLabel`, which
   * would be arithmetic on a formatted string and, worse, arithmetic on the one
   * disclosure that may not contain a number this client produced.
   */
  leadDayReceiptLabel: string;
  /** The one online charge, and the only money Vsolve collects on this path. */
  bookingFeeLabel: string;
  /** What counts as a day. */
  standardDayHours: number;
  /** When overtime starts costing, at the published rate. */
  overtimeHourlyLabel: string;
  /** What the preset's scope includes, in the card's own words. */
  inclusions: readonly string[];
  /** Published add-on rates — the price-moving facts, priced in advance. */
  addOns: readonly AddOnRateView[];
}

export function toRateDisclosureView(preview: RatePreview): RateDisclosureView | null {
  if (
    !preview.is_available ||
    preview.headcount === null ||
    preview.days === null ||
    preview.day_rate_paise === null ||
    preview.total_customer_paise === null ||
    preview.lead_receipt_paise === null ||
    preview.lead_day_receipt_paise === null ||
    preview.booking_fee_paise === null ||
    preview.standard_day_hours === null ||
    preview.overtime_hourly_paise === null
  ) {
    return null;
  }
  return {
    headcount: preview.headcount,
    days: preview.days,
    dayRateLabel: formatMoney(preview.day_rate_paise),
    totalLabel: formatMoney(preview.total_customer_paise),
    leadReceiptLabel: formatMoney(preview.lead_receipt_paise),
    leadDayReceiptLabel: formatMoney(preview.lead_day_receipt_paise),
    bookingFeeLabel: formatMoney(preview.booking_fee_paise),
    standardDayHours: preview.standard_day_hours,
    overtimeHourlyLabel: formatMoney(preview.overtime_hourly_paise),
    inclusions: preview.inclusions ?? [],
    addOns: toAddOnViews(preview.add_on_rates),
  };
}

/**
 * Why no rate can be shown, in the server's own words.
 *
 * Two fields rather than one sentence, because the code decides what the screen
 * may offer next: an unpriced city or an unconfigured service routes to the
 * quote flow, while an unfinished preset routes back to the form. Neither ever
 * produces a number.
 */
export interface RateUnavailableView {
  code: string;
  reason: string;
}

export function toRateUnavailableView(preview: RatePreview): RateUnavailableView | null {
  if (preview.is_available) return null;
  return {
    code: preview.unavailable_code ?? "",
    // The server authors this sentence. A client-side rewrite is how the reason
    // a Customer is given stops matching the reason Operations can act on.
    reason:
      preview.unavailable_reason ??
      "We cannot show a published day rate for this request right now.",
  };
}

/* --------------------------------------------------------------------------
   The booking, through the cascade — `M2-FE-427`
   -------------------------------------------------------------------------- */

/**
 * The booking as it was made, frozen at its own rate.
 *
 * Read from `RateCardBooking` rather than from the live preview: the preview
 * re-prices against whatever card is in force *now*, and a booking made last
 * week reconciles against the number it was made at. Showing the live rate
 * against a live booking is how a Customer is told a different price than the
 * one they agreed to.
 */
export interface BookingView {
  headcount: number;
  days: number;
  dayRateLabel: string;
  totalLabel: string;
  leadReceiptLabel: string;
  /** The whole crew's cash for one day, frozen at the booking's own components. */
  leadDayReceiptLabel: string;
  bookingFeeLabel: string;
  standardDayHours: number;
  overtimeHourlyLabel: string;
  inclusions: readonly string[];
  addOns: readonly AddOnRateView[];
  /** Which wave of the cascade is out. 1 is the first, small one. */
  wave: number;
  /** When the accepting lead's hold lapses, or null when nobody is holding. */
  holdExpiresAt: string | null;
  /** The server's own reason this fell back to the quote flow. */
  fallbackReasonCode: string;
  fellBackAt: string | null;
  confirmedAt: string | null;
}

export function toBookingView(booking: RateCardBooking): BookingView {
  return {
    headcount: booking.headcount,
    days: booking.days,
    dayRateLabel: formatMoney(booking.day_rate_paise),
    totalLabel: formatMoney(booking.total_customer_paise),
    leadReceiptLabel: formatMoney(booking.lead_receipt_paise),
    leadDayReceiptLabel: formatMoney(booking.lead_day_receipt_paise),
    bookingFeeLabel: formatMoney(booking.booking_fee_paise),
    standardDayHours: booking.standard_day_hours,
    overtimeHourlyLabel: formatMoney(booking.overtime_hourly_paise),
    inclusions: readStringList(booking.inclusions),
    addOns: toAddOnViews(readRateMap(booking.add_on_rates)),
    wave: booking.wave,
    holdExpiresAt: booking.hold_expires_at,
    fallbackReasonCode: booking.fallback_reason_code,
    fellBackAt: booking.fell_back_at,
    confirmedAt: booking.confirmed_at,
  };
}

/* --------------------------------------------------------------------------
   The live search — `M2-FE-427`
   -------------------------------------------------------------------------- */

type CascadeProgress = Schemas["CascadeProgress"];

/** One column of the waiting screen's progress strip. */
export interface CascadeWaveView {
  /** 1-based. Matches the server's own wave numbering. */
  number: number;
  state: "done" | "current" | "upcoming";
  /**
   * What is known about this wave, in the server's own facts.
   *
   * The current wave says how many leads are holding its offer. The **next** one
   * says when it fires, because that is the only future wave whose timing the
   * server knows — the ones after it depend on offers that have not been sent.
   * Everything later says nothing at all rather than a projected time, which
   * would be this client inventing a schedule.
   */
  detail: string | null;
  /** The ISO instant this wave fires, for the one wave that has one. */
  firesAt: string | null;
}

export interface CascadeView {
  waves: readonly CascadeWaveView[];
  offersOut: number;
  /** True while at least one lead is holding an offer. */
  hasOffersOut: boolean;
}

/**
 * The cascade as a strip of waves.
 *
 * The mobile design had one bar and one sentence; a wide screen can show the
 * whole shape of the search at once, which is the honest answer to "is anything
 * happening" — a Customer can see that there are four waves, which one is out,
 * and when it widens.
 *
 * `null` when no search is running. The waiting screen is the only caller and it
 * renders nothing rather than an empty strip: a progress bar for a search that
 * has stopped is worse than no progress bar.
 */
export function toCascadeView(cascade: CascadeProgress | null): CascadeView | null {
  if (cascade === null || cascade.total_waves < 1) return null;

  const waves = Array.from({ length: cascade.total_waves }, (_, index) => {
    const number = index + 1;
    const state: CascadeWaveView["state"] =
      number < cascade.wave ? "done" : number === cascade.wave ? "current" : "upcoming";

    if (state === "current") {
      return {
        number,
        state,
        detail:
          cascade.offers_out === 0
            ? "Sending now"
            : `${cascade.offers_out} ${cascade.offers_out === 1 ? "supervisor" : "supervisors"}`,
        firesAt: null,
      };
    }
    if (state === "done") {
      return { number, state, detail: "No takers", firesAt: null };
    }
    // Only the wave immediately after the current one has a known time, and only
    // while the server published one.
    const isNext = number === cascade.wave + 1;
    return {
      number,
      state,
      detail: isNext && cascade.next_wave_at !== null ? null : "If needed",
      firesAt: isNext ? cascade.next_wave_at : null,
    };
  });

  return {
    waves,
    offersOut: cascade.offers_out,
    hasOffersOut: cascade.offers_out > 0,
  };
}

/* --------------------------------------------------------------------------
   The fee, and what happened to it — `M2-FE-428`, `M2-FE-429`
   -------------------------------------------------------------------------- */

/**
 * The booking fee's money, exactly as settled.
 *
 * `travelCompensationLabel` and `platformShareLabel` are `null` until the fee is
 * actually split, and that is deliberate: both fields are `0` on an `ACTIVE`
 * fee, and rendering "₹0 to the lead" beside a live booking would describe a
 * settlement that has not happened. The split is shown when it exists and never
 * predicted — the ratio is owner configuration this client has no copy of.
 */
export interface FeeMoneyView {
  amountLabel: string;
  travelCompensationLabel: string | null;
  platformShareLabel: string | null;
  /** The gapless `M2A-` reference support quotes. Null before one is issued. */
  receiptNumber: string | null;
  settlementReasonCode: string;
  failureCode: string;
}

export function toFeeMoneyView(fee: BookingFee): FeeMoneyView {
  const isSplit = fee.status === "FORFEIT_SPLIT";
  return {
    amountLabel: formatMoney(fee.amount_paise),
    travelCompensationLabel: isSplit ? formatMoney(fee.travel_compensation_paise) : null,
    platformShareLabel: isSplit ? formatMoney(fee.platform_share_paise) : null,
    // Carried through as the server composed it, never re-assembled from series
    // and sequence — one string, so support is never read two versions of it.
    receiptNumber:
      fee.receipt_sequence === null || fee.receipt_series === ""
        ? null
        : `${fee.receipt_series}${fee.receipt_sequence}`,
    settlementReasonCode: fee.settlement_reason_code,
    failureCode: fee.failure_code,
  };
}

/* --------------------------------------------------------------------------
   Shared
   -------------------------------------------------------------------------- */

/**
 * Who is coming, once we are entitled to say.
 *
 * Identity is released by the **confirmation**, never by the hold: a Customer
 * watching a held booking sees that *a* crew took it and learns who once the fee
 * is verified. The server enforces that — `confirmed_partner_name` is null at
 * every other status — and this only reads it.
 */
export function confirmedCrewName(state: RateCardState): string | null {
  const name = state.confirmed_partner_name;
  return name === null || name.trim() === "" ? null : name;
}

/* --------------------------------------------------------------------------
   The one rate & terms sheet — screen 11

   Every place on the A3 path that used to spell out the day rate, the
   inclusions, the overtime rule and the cancellation window in its own words
   now hands its own record to `toRateTermsView` and gets back one shape.
   `RateTermsSheet` renders it. There is exactly one of these per screen.
   -------------------------------------------------------------------------- */

/**
 * Everything `RateTermsSheet` needs, regardless of which record it came from.
 *
 * `standardDayHours` and `overtimeHourlyLabel` are nullable because the
 * post-booking `CrewTermsView` (`features/engagement/adapters`) carries them
 * nullable too — an older record can predate the fields. Pre-booking views
 * never omit them; `toRateDisclosureView`/`toBookingView` already refuse to
 * produce a view without every figure present.
 */
export interface RateTermsView {
  headcount: number;
  days: number;
  dayRateLabel: string;
  totalLabel: string;
  leadReceiptLabel: string;
  leadDayReceiptLabel: string;
  bookingFeeLabel: string;
  standardDayHours: number | null;
  overtimeHourlyLabel: string | null;
  inclusions: readonly string[];
  addOns: readonly AddOnRateView[];
}

/**
 * The one adapter behind `RateTermsSheet`, for every shape the rate travels in.
 *
 * Three callers, one output: the live preview before a Customer books
 * (`RateDisclosureView`), the frozen booking through the cascade and after
 * (`BookingView`), and the engagement's own frozen terms once the request
 * became a booking (`CrewTermsView`, imported as a type only from
 * `features/engagement/adapters` — this file never reaches into that feature's
 * runtime code, only its published shape). All three already carry
 * server-formatted labels; this only picks the common fields out.
 */
export function toRateTermsView(
  source: RateDisclosureView | BookingView | CrewTermsView,
): RateTermsView {
  return {
    headcount: source.headcount,
    days: source.days,
    dayRateLabel: "dayRateLabel" in source ? source.dayRateLabel : source.perWorkerDayLabel,
    totalLabel: "totalLabel" in source ? source.totalLabel : source.totalCustomerLabel,
    leadReceiptLabel: source.leadReceiptLabel,
    leadDayReceiptLabel: source.leadDayReceiptLabel,
    bookingFeeLabel: source.bookingFeeLabel,
    standardDayHours: source.standardDayHours,
    overtimeHourlyLabel: source.overtimeHourlyLabel,
    inclusions: source.inclusions,
    addOns:
      "addOns" in source
        ? source.addOns
        : source.addOnRates.map((rate) => ({
            code: rate.code,
            label: rate.label,
            amountLabel: rate.amountLabel,
          })),
  };
}
