import type { Schemas } from "@vsolve/api-client";
import { formatMoney } from "@vsolve/ui";
import type { useT } from "@vsolve/ui";

/**
 * A crew offer in the lead's own terms, and what accepting one commits them to.
 *
 * Checked against ADR-0009 and `07-state-machines-and-permissions.md` §2, §4c
 * and §7. Not a component, so it cannot call `useT()` at module scope — every
 * function below that renders a sentence takes `t` as a parameter instead, and
 * the English in this file's doc comments is commentary, not what ships; the
 * real copy lives in the `work.crewOfferState.*` catalogue keys.
 *
 * ## The four rules this file exists to not get wrong
 *
 * 1. **The number on screen is the lead's own, and it is read, never derived.**
 *    `CrewOffer` publishes `lead_day_receipt_paise` and `lead_total_receipt_paise`
 *    and no customer total and no booking fee. The per-worker figure in
 *    `crewMathsLine` is the one deliberate exception, and it is shown only when
 *    the server's day figure divides exactly by the headcount.
 * 2. **Accepting the job is accepting the published rate for that job.** Nothing
 *    to compose, nothing to negotiate on site, no cash extras (§7).
 * 3. **A held win is not a confirmed job.** First accept wins, but the win is held
 *    while the Customer pays the booking fee. The copy says **don't travel yet**.
 * 4. **Wages are direct, daily, at day end.** The platform never holds the wage
 *    money and must not imply that it does.
 *
 * ## Copy rule (2026-08-30 redesign)
 *
 * Every user-visible string here is at most one sentence. The explanations that
 * used to sit beside each screen live on one page, `HOW_DAY_HIRE_WORKS_HREF`,
 * linked once from the offer and once from the job hub.
 */

export type CrewOffer = Schemas["CrewOffer"];
export type CrewOfferAccepted = Schemas["CrewOfferAccepted"];
export type RateCardBookingStatus = Schemas["RateCardBookingStatusEnum"];

/** The one page that explains the whole day-hire path. */
export const HOW_DAY_HIRE_WORKS_HREF = "/work/how-day-hire-works";

/**
 * An offer this lead has answered in this session.
 *
 * Held by the screen rather than by the row, because the row does not survive
 * the answer: `GET /partner/crew-offers/` filters to `INVITED`, so a successful
 * accept or decline removes the offer from the very next read.
 *
 * The declined arm carries the code the **lead chose**, not a server echo:
 * `CrewOffer` publishes no `reason_code` at any status.
 */
export type CrewOfferAnswer =
  | { readonly kind: "accepted"; readonly offer: CrewOffer; readonly booking: CrewOfferAccepted }
  | {
      readonly kind: "declined";
      readonly offer: CrewOffer;
      readonly reasonCode: Schemas["CrewOfferDeclineReasonCodeEnum"];
    };

/* ---------------------------------------------------------------------------
   Is this offer still answerable
   --------------------------------------------------------------------------- */

/**
 * `CrewOffer.status` is published as a bare `CharField`, not as
 * `VendorInvitationStatusEnum`, so the narrowing is a runtime check against the
 * published enum's members rather than something the compiler can prove.
 */
const KNOWN_STATUSES: readonly Schemas["VendorInvitationStatusEnum"][] = [
  "INVITED",
  "ACCEPTED",
  "QUOTED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
];

function readOfferStatus(status: string): Schemas["VendorInvitationStatusEnum"] | null {
  return KNOWN_STATUSES.find((known) => known === status) ?? null;
}

/**
 * Whether the screen may offer accept and decline. Fails closed on a status
 * this build has no words for.
 */
export function isOfferAnswerable(offer: CrewOffer): boolean {
  return readOfferStatus(offer.status) === "INVITED";
}

/**
 * Answerable **and the clock has not run out**, judged against the server's own
 * `server_now` rather than the device's. The list endpoint already refuses to
 * return a lapsed offer; this closes the window between a fifteen-second poll
 * and a two-minute deadline.
 */
export function isOfferLive(offer: CrewOffer, serverNow: string): boolean {
  if (!isOfferAnswerable(offer)) return false;
  if (offer.responds_by === null || offer.responds_by === undefined) return true;
  return new Date(offer.responds_by).getTime() > new Date(serverNow).getTime();
}

/* ---------------------------------------------------------------------------
   Words for counts
   --------------------------------------------------------------------------- */

/** "5 helpers" / "1 helper", from the `work.crewOfferState.helperCount` plural. */
export function helperCountLine(t: ReturnType<typeof useT>, headcount: number): string {
  return t("work.crewOfferState.helperCount", { count: headcount });
}

/** "3 days" / "1 day", from the `work.crewOfferState.dayCount` plural. */
export function dayCountLine(t: ReturnType<typeof useT>, days: number): string {
  return t("work.crewOfferState.dayCount", { count: days });
}

/** "5 helpers · 3 days" */
export function crewSizeLine(t: ReturnType<typeof useT>, headcount: number, days: number): string {
  return t("work.crewOfferState.crewSizeLine", {
    helperCount: helperCountLine(t, headcount),
    dayCount: dayCountLine(t, days),
  });
}

/* ---------------------------------------------------------------------------
   The lead's own number
   --------------------------------------------------------------------------- */

/**
 * The per-worker day figure, or null when the server's day figure does not
 * divide exactly by the headcount. Never rounded: a figure the lead cannot
 * check against the server's own is a figure this app does not print.
 */
export function perWorkerDayPaise(leadDayReceiptPaise: number, headcount: number): number | null {
  if (headcount <= 0) return null;
  if (leadDayReceiptPaise % headcount !== 0) return null;
  return leadDayReceiptPaise / headcount;
}

/**
 * The maths behind the total, in one line.
 *
 * `₹600 × 5 × 3` when the day figure divides exactly by the headcount, else
 * `₹3,000 a day × 3`.
 */
export function crewMathsLine(
  t: ReturnType<typeof useT>,
  input: {
    readonly leadDayReceiptPaise: number;
    readonly headcount: number;
    readonly days: number;
  },
): string {
  const perWorker = perWorkerDayPaise(input.leadDayReceiptPaise, input.headcount);
  if (perWorker === null) {
    return t("work.crewOfferState.mathsLine.perDay", {
      amount: formatMoney(input.leadDayReceiptPaise),
      days: input.days,
    });
  }
  return `${formatMoney(perWorker)} × ${input.headcount} × ${input.days}`;
}

/** The half of the maths line that must not be softened. */
export function paidDailyLabel(t: ReturnType<typeof useT>): string {
  return t("work.crewOfferState.paidDaily");
}

/**
 * The overtime line, or null where the card publishes no rate.
 *
 * Zero is a real published value meaning "no overtime on this card", and
 * printing "₹0/hr" would read as free overtime.
 */
export function overtimeLine(
  t: ReturnType<typeof useT>,
  hourlyPaise: number | null | undefined,
  standardDayHours: number | null | undefined,
): string | null {
  if (hourlyPaise === null || hourlyPaise === undefined || hourlyPaise <= 0) return null;
  const rate = t("work.crewOfferState.overtime.base", { amount: formatMoney(hourlyPaise) });
  if (standardDayHours === null || standardDayHours === undefined || standardDayHours <= 0) {
    return rate;
  }
  return t("work.crewOfferState.overtime.afterHours", { rate, hours: standardDayHours });
}

/** "Loading & shifting · Own tools" — at most two inclusions, joined. */
export function inclusionsLine(inclusions: readonly string[], max = 2): string | null {
  const kept = inclusions.map((line) => line.trim()).filter((line) => line !== "");
  if (kept.length === 0) return null;
  return kept.slice(0, max).join(" · ");
}

/* ---------------------------------------------------------------------------
   Dates
   --------------------------------------------------------------------------- */

/** "Mon 2 Sep" in the device's own zone. Null-safe. */
export function startDayLabel(iso: string | null | undefined): string | null {
  if (iso === null || iso === undefined) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
}

/* ---------------------------------------------------------------------------
   The confirm, before the tap
   --------------------------------------------------------------------------- */

/** "Send 5 helpers for 3 days at ₹600 each per day?" */
export function acceptQuestion(t: ReturnType<typeof useT>, offer: CrewOffer): string {
  const perWorker = perWorkerDayPaise(offer.lead_day_receipt_paise, offer.headcount);
  const rate =
    perWorker === null
      ? t("work.crewOfferState.rate.flat", { amount: formatMoney(offer.lead_day_receipt_paise) })
      : t("work.crewOfferState.rate.perWorker", { amount: formatMoney(perWorker) });
  return t("work.crewOfferState.acceptQuestion", {
    helperCount: helperCountLine(t, offer.headcount),
    dayCount: dayCountLine(t, offer.days),
    rate,
  });
}

export function acceptConsequence(t: ReturnType<typeof useT>): string {
  return t("work.crewOfferState.acceptConsequence");
}

/* ---------------------------------------------------------------------------
   The held win
   --------------------------------------------------------------------------- */

export interface AcceptOutcome {
  readonly title: string;
  readonly message: string;
  /** True while the win is held rather than confirmed. Governs the travel warning. */
  readonly isHeld: boolean;
  readonly tone: "progress" | "action" | "gone";
}

export function dontTravelYet(t: ReturnType<typeof useT>): string {
  return t("work.crewOfferState.dontTravelYet");
}

export function holdLapsed(t: ReturnType<typeof useT>): string {
  return t("work.crewOfferState.holdLapsed");
}

/**
 * How a successful accept reads. `CrewOfferAccepted.status` is the whole
 * distinction, and it is the server's answer.
 */
export function describeAccept(t: ReturnType<typeof useT>, booking: CrewOfferAccepted): AcceptOutcome {
  const status = booking.status;

  if (status === "OFFER_HELD") {
    return {
      isHeld: true,
      tone: "progress",
      title: t("work.crewOfferState.accept.held.title"),
      message: t("work.crewOfferState.accept.held.message"),
    };
  }

  if (status === "CONFIRMED") {
    return {
      isHeld: false,
      tone: "action",
      title: t("work.crewOfferState.accept.confirmed.title"),
      message: t("work.crewOfferState.accept.confirmed.message"),
    };
  }

  return {
    isHeld: false,
    tone: "gone",
    title: t("work.crewOfferState.accept.gone.title"),
    message: t("work.crewOfferState.accept.gone.message"),
  };
}
