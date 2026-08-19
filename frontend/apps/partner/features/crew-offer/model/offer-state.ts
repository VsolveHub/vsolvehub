import type { Schemas } from "@vsolve/api-client";

/**
 * A crew offer in the lead's own terms, and what accepting one commits them to.
 *
 * The decision half of `M2-FE-316`. Pure. Every sentence here is checked against
 * [ADR-0009](../../../../../docs/adr/0009-m2-rate-card-instant-dispatch-for-a3.md)
 * and `07-state-machines-and-permissions.md` §2, §4c and §7, because Partner copy
 * that overstates what a job pays — or when it is confirmed — is a promise the
 * platform then has to break in front of a crew standing on a pavement.
 *
 * ## The four rules this file exists to not get wrong
 *
 * 1. **The number on screen is the lead's own, and it is read, never derived.**
 *    `CrewOffer` publishes `lead_day_receipt_paise` and `lead_total_receipt_paise`
 *    and deliberately publishes **no** customer total and **no** booking fee at
 *    any status — and since 1.30.0 neither does `CrewOfferAccepted`, so the whole
 *    path is now free of them. Nothing in this column reconstructs the lead's take
 *    from a rate card's components: that would be the platform telling a
 *    contractor what he earns from arithmetic he cannot check, and it would drift
 *    from the server's own figure the first time rounding changed.
 * 2. **Accepting the job is accepting the published rate for that job.** There is
 *    nothing to compose — no quote, no line items, no negotiation — and a Partner
 *    may never charge above the card or demand a cash extra (§7). Said before the
 *    tap, not after.
 * 3. **A held win is not a confirmed job.** First accept wins, but the win is held
 *    while the *Customer* pays the booking fee, and only a verified provider
 *    callback hardens it (§4c). The copy says **do not travel yet**, exactly as
 *    the A5 held slot does. ADR-0009 names the failure this avoids: a
 *    confirmed-then-ghosted crew is worse than a wait.
 * 4. **Wages are direct, daily, at day end.** The platform never holds the wage
 *    money and must not imply that it does. The booking fee is the only money
 *    Vsolve collects on this path, and it is the Customer's to pay.
 */

export type CrewOffer = Schemas["CrewOffer"];

/**
 * What accepting answers with, since contract **1.30.0**.
 *
 * Was `RateCardBooking` at 1.29.0 — the Customer's whole booking, including
 * `total_customer_paise`, `booking_fee_paise` and `day_rate_paise`. This column
 * refused to render those three and logged the disclosure in
 * `frontend-execution-plan.md` §7; 1.30.0 narrowed the response instead, so the
 * lead's own number is now the **only** money on this path and the rule is
 * enforced by the wire rather than by this client's restraint.
 *
 * `RateCardBooking` itself is untouched and still answers `m2_rate_card_read` on
 * the Customer's side. It is simply no longer this screen's shape.
 */
export type CrewOfferAccepted = Schemas["CrewOfferAccepted"];
export type RateCardBookingStatus = Schemas["RateCardBookingStatusEnum"];

/**
 * An offer this lead has answered in this session.
 *
 * Held by the inbox rather than by the row, because the row does not survive the
 * answer: `GET /partner/crew-offers/` filters to `INVITED`, so a successful
 * accept or decline removes the offer from the very next read. See
 * `CrewOfferAnswerHandlers` in `queries.ts` for the whole mechanism.
 *
 * The declined arm carries the code the **lead chose**, not a server echo:
 * `CrewOffer` publishes no `reason_code` at any status, so the screen can only
 * honestly show back what it sent. Recorded in `frontend-execution-plan.md` §7.
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
 * The invitation statuses this build has words for.
 *
 * `CrewOffer.status` is published as a bare `CharField`, not as
 * `VendorInvitationStatusEnum`, even though that component exists and is what the
 * field is populated from (`invitation.status`). So the narrowing is a runtime
 * check against the published enum's members rather than something the compiler
 * can prove — recorded as a schema correction in `frontend-execution-plan.md` §7.
 */
const KNOWN_STATUSES: readonly Schemas["VendorInvitationStatusEnum"][] = [
  "INVITED",
  "ACCEPTED",
  "QUOTED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
];

export function readOfferStatus(status: string): Schemas["VendorInvitationStatusEnum"] | null {
  return KNOWN_STATUSES.find((known) => known === status) ?? null;
}

/**
 * Whether the screen may offer accept and decline.
 *
 * **Fail-closed on an unrecognised status.** `GET /partner/crew-offers/` filters
 * to `INVITED` server-side and the inbox drops rows it has already answered, so
 * this is a guard rather than a branch anyone should expect to see: it exists for
 * the case where the server starts returning a status this build has no words
 * for. Offering an accept there is offering a button whose only outcome is a
 * refusal, so an unknown status is treated as unanswerable and says so.
 */
export function isOfferAnswerable(offer: CrewOffer): boolean {
  return readOfferStatus(offer.status) === "INVITED";
}

/**
 * Answerable **and the clock has not run out**, judged against the server's own
 * `server_now` rather than the device's.
 *
 * The list endpoint already refuses to return a lapsed offer, so this is the
 * second of two guards rather than the only one. It earns its place because the
 * two are racing different things: the server filters at the moment it answers,
 * and this filters at the moment the lead looks. Between a fifteen-second poll
 * and a hundred-and-twenty-second deadline there is always a window where the
 * cached list is a few seconds stale, and an offer rendered inside it is a button
 * that produces a refusal describing a race that did not happen.
 *
 * `server_now` and not `Date.now()`: a partner phone with a skewed clock would
 * otherwise hide live offers or show dead ones, and the payload publishes the
 * server's own instant precisely so no client has to trust its own.
 */
export function isOfferLive(offer: CrewOffer, serverNow: string): boolean {
  if (!isOfferAnswerable(offer)) return false;
  if (offer.responds_by === null || offer.responds_by === undefined) return true;
  return new Date(offer.responds_by).getTime() > new Date(serverNow).getTime();
}

/* ---------------------------------------------------------------------------
   The lead's own number
   --------------------------------------------------------------------------- */

/**
 * The roster check, stated before the server has to refuse it.
 *
 * `accept_crew_offer` takes a capacity hold **sized against the roster** and
 * refuses with `m2_roster_insufficient` when the lead's verified roster is
 * smaller than the requested headcount. `verified_roster_size` is published for
 * exactly this reason: an offer you cannot accept should say so on the screen
 * that offers it, and it should say what the fix is.
 *
 * This never disables the accept button. The count can be a minute old, a
 * verification can land while this screen is open, and a button that refuses on a
 * stale read is the dead submit `M2-FE-315` already learned not to ship. It warns;
 * the server decides.
 */
export interface RosterShortfall {
  readonly headcount: number;
  readonly verified: number;
  /** How many more verified people the roster needs. Always positive. */
  readonly short: number;
}

export function rosterShortfallOf(offer: CrewOffer): RosterShortfall | null {
  const short = offer.headcount - offer.verified_roster_size;
  if (short <= 0) return null;
  return { headcount: offer.headcount, verified: offer.verified_roster_size, short };
}

export function helperNoun(headcount: number): string {
  return headcount === 1 ? "helper" : "helpers";
}

export function dayNoun(days: number): string {
  return days === 1 ? "day" : "days";
}

/**
 * The sentence the whole product is, for this vendor.
 *
 * Composed from two server figures and a count — never from a rate card. The
 * second half is the part that must not be softened: the customer pays the lead
 * **directly, at day end**, peer to peer. Vsolve does not hold it, cannot release
 * it, and must never be presented as protecting it.
 */
export const WAGE_SETTLEMENT =
  "The customer pays you directly at day end. Vsolve never holds this money — each evening you both get a one-tap “Day settled?” prompt at the published amount, and the payment is between you.";

/**
 * What accepting commits the lead to. Stated before the tap.
 *
 * Three facts decide it, and all three are the ones a contractor would otherwise
 * find out on site: the rate is the rate, the extras have a published price and go
 * through the app, and asking for cash on top is a reportable act.
 */
export const ACCEPT_COMMITMENT =
  "Accepting this job is accepting the published rate for it. There is nothing to quote and nothing to negotiate on site. Genuine extras — overtime, an add-on — go through the app at the rates below and count only once the customer approves them. Asking for money above this rate, or for cash on the side, is something the customer can report in one tap.";

/**
 * The overtime line.
 *
 * Rendered only where the card publishes a rate. Zero is a real published value
 * meaning "there is no overtime rate on this card", and printing "₹0 an hour"
 * would read as free overtime — which is the opposite of what it means.
 */
export function describeOvertime(offer: CrewOffer): string | null {
  if (offer.overtime_hourly_paise <= 0) return null;
  return `A day is ${offer.standard_day_hours} hours. Past that, overtime is paid at the published hourly rate — but only after the customer approves it in the app.`;
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

/**
 * How a successful accept reads.
 *
 * `CrewOfferAccepted.status` is the whole distinction, and it is the server's
 * answer rather than an inference from anything on this screen:
 *
 * - `OFFER_HELD` — the ordinary outcome. The lead won the cascade and the
 *   Customer is now paying the booking fee. **Do not travel yet**, in those
 *   words, because a crew sent out against an unpaid hold is the exact failure
 *   ADR-0009 says is worse than a wait. If the Customer never pays, the hold
 *   lapses on its own: nothing is charged, nothing is owed, and the lead's
 *   standing is untouched.
 * - `CONFIRMED` — the fee is already verified, so the job is real.
 * - Anything else is a booking that moved under the accept. Said plainly rather
 *   than dressed as a win.
 *
 * At 1.29.0 the accept response was the whole `RateCardBooking`, carrying
 * `total_customer_paise` and `booking_fee_paise` — the *Customer's* numbers —
 * and this column rendered neither on purpose. **1.30.0 removed them from the
 * response**, so the discipline no longer depends on anyone remembering it:
 * `CrewOfferAccepted` publishes `lead_receipt_paise` and nothing a lead does not
 * receive. ADR-0009's rule is now the shape of the payload.
 */
export function describeAccept(booking: CrewOfferAccepted): AcceptOutcome {
  const status = booking.status;

  if (status === "OFFER_HELD") {
    return {
      isHeld: true,
      tone: "progress",
      title: "The job is yours — held",
      message:
        "You answered first, so the customer is now paying the booking fee that confirms it. Vsolve confirms the job the moment that payment clears, and you will be told. Do not travel yet and do not line up your crew on this alone. If the customer never pays, the hold lapses by itself — nothing is charged to them, nothing is owed to you, and it does not count against you.",
    };
  }

  if (status === "CONFIRMED") {
    return {
      isHeld: false,
      tone: "action",
      title: "Confirmed — this job is yours",
      message:
        "The customer's booking fee has cleared and the job is real. Bring the crew on the day and confirm attendance from your shifts screen.",
    };
  }

  return {
    isHeld: false,
    tone: "gone",
    title: "This booking has moved on",
    message:
      "Your answer reached us, but the customer's booking is no longer waiting for a crew. Nothing is charged to you and nothing counts against you. Check your offers again — the next one is usually minutes away.",
  };
}

/**
 * The lapse clock on a held win, as a sentence rather than a countdown.
 *
 * `hold_expires_at` is nullable and a null is a real answer: the booking-fee
 * window is server configuration and, unset, the server fails closed rather than
 * inventing one. A countdown drawn from a guessed default would be the client
 * promising a deadline nobody set.
 */
export function describeHoldWindow(booking: CrewOfferAccepted): string {
  if (booking.hold_expires_at === null) {
    return "Vsolve is waiting on the customer's payment. There is nothing for you to do until we confirm it.";
  }
  return "The hold lapses at the time shown if the customer has not paid by then. You lose nothing if it does.";
}

/* ---------------------------------------------------------------------------
   The dispatch clock
   --------------------------------------------------------------------------- */

/**
 * How long is left, in the language of the M1 dispatch clock.
 *
 * Deliberately **not** the enquiry inbox's `describeDeadline`. That one explains
 * a business-hours SLA — "we count response time in your area's working hours" —
 * which is true of an invitation to quote and false of a crew offer. This is a
 * small wave with a minutes-level timeout: it passes at 2 a.m. the same as at
 * 2 p.m., and the offer goes to the next lead when it does.
 *
 * `passed` never announces the expiry. The server expires an offer on its own
 * schedule and `status` is the only thing that knows, so a passed clock stops the
 * screen *offering* an accept and says the offer may already be gone.
 */
export type OfferClockState = "none" | "open" | "closing" | "passed";

/** Under two minutes reads as urgent on a minutes-level clock. */
export const OFFER_CLOSING_SOON_MS = 2 * 60 * 1000;

export function offerClockStateFor(input: {
  readonly respondsBy: string | null;
  readonly remainingMs: number | null;
}): OfferClockState {
  if (input.respondsBy === null || input.remainingMs === null) return "none";
  if (input.remainingMs <= 0) return "passed";
  return input.remainingMs <= OFFER_CLOSING_SOON_MS ? "closing" : "open";
}

export function describeOfferClock(state: OfferClockState): string {
  switch (state) {
    case "none":
      return "This offer carries no published deadline. Answer anyway — the first lead to accept takes the job.";
    case "open":
      return "This is a live dispatch, counted in real minutes rather than working hours. When it runs out the job goes to the next lead.";
    case "closing":
      return "This is about to go to the next lead. Accepting now is the only way to keep it.";
    case "passed":
      return "By our clock this offer has run out. Vsolve decides when an offer actually expires, so re-read before assuming it is gone.";
  }
}
