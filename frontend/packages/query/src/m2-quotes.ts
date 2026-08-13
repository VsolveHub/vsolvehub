/**
 * The Customer's access surface — contract 1.24.0.
 *
 * Everything a Customer pays for before any work is agreed, and everything they
 * read once they have: the **A3 quote unlock**, the **A5 visit plan and its
 * visits**, the full quotes and estimates behind both, rejection, re-validation
 * and selection.
 *
 * The hooks live in `apps/customer/features/{access,quotes}/queries.ts`, on the
 * same split `m2-requirement.ts` documents: the parser is the durable,
 * React-free, testable half and the hook is a call site.
 *
 * ## Why one module carries both doors
 *
 * A3 and A5 sell different things through the same shape — *money is taken
 * against a real accepted commitment, and the entitlement it buys is a field on
 * a server read.* Splitting them would put `isAccessPriceUnavailable` in one
 * file and its twin in another, and the two refusals below are the ones both
 * doors fail closed on. The archetype is a field on the requirement, never a
 * branch in the cache — the same rule `m2-keys.ts` states for its own naming.
 *
 * ## The one rule every function here is written to enforce
 *
 * **Only a verified provider callback grants anything.** No client redirect, no
 * `AccessCheckout` response and no payment attempt says a Customer *has* an
 * unlock or a charged plan. `AccessCheckout` says an attempt exists; the
 * `unlock` object on `GET .../unlock/` and the `plan` object on `GET
 * .../visit-plan/` are the truth, and `unlockPhase` / `visitPlanPhase` below
 * read only those.
 *
 * That is not a stylistic preference here — it is the only mechanism available.
 * `GET /api/v1/payment-attempts/{id}/` resolves ownership through
 * `checkout__customer`, and an M2 access attempt is created by
 * `commerce.services.initiate_standalone_payment_attempt` with `checkout=None`,
 * so **the Customer cannot read the attempt they just created**. Logged in
 * `frontend-execution-plan.md` §7. The state read is the whole recovery path.
 */

import { ApiRequestError } from "@vsolve/api-client";
import type { Schemas } from "@vsolve/api-client";

import { m2QueryKeys } from "./m2-keys";

/* --------------------------------------------------------------------------
   Wire shapes
   -------------------------------------------------------------------------- */

export type AccessCheckout = Schemas["AccessCheckout"];

export type UnlockState = Schemas["UnlockState"];
export type QuoteUnlock = Schemas["QuoteUnlock"];
export type QuoteUnlockStatus = Schemas["QuoteUnlockStatusEnum"];

export type QuoteTeaser = Schemas["QuoteTeaser"];
export type QuoteTeaserList = Schemas["QuoteTeaserList"];

export type VisitPlanState = Schemas["VisitPlanState"];
export type VisitPlan = Schemas["VisitPlan"];
export type VisitPlanShare = Schemas["VisitPlanShare"];
export type VisitPlanShareStatus = Schemas["VisitPlanShareStatusEnum"];
export type VisitPlanStatus = Schemas["VisitPlanStatusEnum"];
export type VisitPlanTier = Schemas["VisitPlanTier"];

export type SiteVisit = Schemas["SiteVisit"];
export type SiteVisitStatus = Schemas["SiteVisitStatusEnum"];
export type VisitNoShowParty = Schemas["VisitNoShowPartyEnum"];

export type CustomerProposal = Schemas["CustomerProposal"];
export type CustomerQuoteList = Schemas["CustomerQuoteList"];
export type ProposalStage = Schemas["ProposalStage"];
export type ProposalStatus = Schemas["ProposalStatusEnum"];
export type ProposalTaxBasis = Schemas["ProposalTaxBasisEnum"];
export type ProposalUsability = Schemas["ProposalUsabilityEnum"];
export type RejectionReason = Schemas["RejectionReasonEnum"];

export type ProposalSelection = Schemas["ProposalSelection"];
export type ProposalSelectionStatus = Schemas["ProposalSelectionStatusEnum"];

/* --------------------------------------------------------------------------
   Keys
   -------------------------------------------------------------------------- */

/**
 * Cache keys for the four 1.24.0 reads `m2-keys.ts` predates.
 *
 * `m2-keys.ts` is frozen and was written against proposal 0012, which had no
 * visit plan, no full-quote read and no selection. Rather than edit a frozen
 * file mid-wave, these are composed **from** it, and every one of them nests
 * under `m2QueryKeys.requirements.detail(id)` — the same construction
 * `requirements.timeline` already uses.
 *
 * Nesting is the load-bearing part, not tidiness. `M2_INVALIDATION`'s
 * `requirementScope` invalidates `requirements.detail(id)` as a *prefix*, so
 * selecting a proposal or rejecting one already clears the visit plan and the
 * selection beneath it. A sibling namespace would have needed every one of
 * those rows edited to stay correct, in the file nobody may edit.
 *
 * The unlock is the exception and keeps its own published key: it already
 * exists in the frozen factory, and `m2-keys.ts` argues there for why it is
 * keyed by requirement rather than by unlock id — after a lost payment redirect
 * the client holds no unlock id at all.
 *
 * Promotion into `m2-keys.ts` is requested in `frontend-execution-plan.md` §7.
 */
export const m2AccessKeys = {
  /** `GET /requirements/{id}/unlock/` — A3. */
  unlock: (requirementId: string) => m2QueryKeys.unlock.forRequirement(requirementId),
  /** `GET /requirements/{id}/visit-plan/` — A5's chooser and its tracker in one read. */
  visitPlan: (requirementId: string) =>
    [...m2QueryKeys.requirements.detail(requirementId), "visit-plan"] as const,
  /** `GET /requirements/{id}/quotes/teasers/` — A3, pre-unlock. */
  teasers: (requirementId: string) => m2QueryKeys.proposals.teasers(requirementId),
  /** `GET /requirements/{id}/quotes/` — the full quotes or estimates, post-entitlement. */
  quotes: (requirementId: string) => m2QueryKeys.proposals.unlocked(requirementId),
  /** `GET /requirements/{id}/selection/` — the live selection, or none. */
  selection: (requirementId: string) =>
    [...m2QueryKeys.requirements.detail(requirementId), "selection"] as const,
} as const;

/* --------------------------------------------------------------------------
   Refusals — including the two that arrive on a well-formed request
   -------------------------------------------------------------------------- */

function hasCode(error: unknown, code: string): boolean {
  return error instanceof ApiRequestError && error.code === code;
}

/**
 * `409 m2_access_price_unavailable` — Operations has loaded no effective price.
 *
 * **Not a field error and not retryable.** The unlock price and the visit-plan
 * tier prices are blocking owner decision 1; `apps.requirements.pricing` reads
 * an effective-dated `M2AccessPrice` row and fails closed when none is loaded.
 * On the read side the same state shows as `price_paise: null` and
 * `available_tiers: []`.
 *
 * The honest screen says we cannot offer this yet and points at support. It must
 * not render a number, and it must not offer "Try again" — nothing the Customer
 * can do changes the answer.
 *
 * Not in the frozen `errors.ts` table, so `describeError` falls back to the
 * generic 409 recovery (`choose_again`), which is the wrong advice. That is why
 * every screen tests this explicitly rather than leaning on the error layer.
 * Requested in `frontend-execution-plan.md` §7.
 */
export function isAccessPriceUnavailable(error: unknown): boolean {
  return hasCode(error, "m2_access_price_unavailable");
}

/**
 * `409 m2_policy_unavailable` — a clock, cap or disposition rule was never decided.
 *
 * The twin of the above, and two codes rather than one because the recoveries
 * differ: this one means a *rule* is missing (the non-responsive rejection cap,
 * the customer-no-show platform-share disposition), not that nothing can be
 * sold. Same fail-closed design, same "support can help" copy, same absence of a
 * retry.
 */
export function isPolicyUnavailable(error: unknown): boolean {
  return hasCode(error, "m2_policy_unavailable");
}

/** `409 m2_unlock_not_available` — A3: no usable quote is live at this instant. */
export function isUnlockNotAvailable(error: unknown): boolean {
  return hasCode(error, "m2_unlock_not_available");
}

/** `403 m2_unlock_required` — the A3 quotes are still behind the unlock. */
export function isUnlockRequired(error: unknown): boolean {
  return hasCode(error, "m2_unlock_required");
}

/** `409 m2_visit_plan_required` — A5: no plan chosen, or the plan is unpaid. */
export function isVisitPlanRequired(error: unknown): boolean {
  return hasCode(error, "m2_visit_plan_required");
}

/**
 * `409 m2_visit_plan_not_chargeable` — nothing to pay for yet.
 *
 * No vendor holds a slot, the plan is already paid for, or a reclassification
 * credit covers it. Classified `await_confirmation` in `errors.ts`, correctly:
 * the Customer cannot make a vendor confirm, so waiting is the only next step.
 */
export function isVisitPlanNotChargeable(error: unknown): boolean {
  return hasCode(error, "m2_visit_plan_not_chargeable");
}

/** `409 m2_rejection_cap_reached` — every free replacement has been used. */
export function isRejectionCapReached(error: unknown): boolean {
  return hasCode(error, "m2_rejection_cap_reached");
}

/** `409 m2_proposal_not_selectable` — superseded, withdrawn, expired or unvisited. */
export function isProposalNotSelectable(error: unknown): boolean {
  return hasCode(error, "m2_proposal_not_selectable");
}

/**
 * `409 m2_selection_conflict` — another session selected first.
 *
 * The one refusal in this wave that is genuinely retryable, and the contract
 * says so in those words: **the answer changes on its own.** The recovery is to
 * re-read the selection, not to re-post the same choice.
 */
export function isSelectionConflict(error: unknown): boolean {
  return hasCode(error, "m2_selection_conflict");
}

/**
 * `409 m2_requirement_transition_not_allowed` — the record is not in a state
 * this command applies to.
 *
 * Reachable on three of this wave's commands: re-choosing a plan after a vendor
 * has committed, confirming arrival at a visit that is still held rather than
 * scheduled, and reporting a no-show against a visit that was never scheduled.
 * Also not in the frozen `errors.ts` table — §7.
 */
export function isTransitionNotAllowed(error: unknown): boolean {
  return hasCode(error, "m2_requirement_transition_not_allowed");
}

/** `403` on no-show: a party reported its own absence. The server refuses it. */
export function isSelfReportedNoShow(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 403 &&
    error.code === "m2_requirement_transition_not_allowed"
  );
}

/* --------------------------------------------------------------------------
   The A3 unlock
   -------------------------------------------------------------------------- */

/**
 * What the unlock screen may say, derived from the server read alone.
 *
 * | Phase | Means | What the screen offers |
 * |---|---|---|
 * | `unavailable` | `price_paise` is null — no effective price is loaded | Nothing. We cannot offer this yet; support can help. |
 * | `not_yet` | No usable quote exists, so nothing is purchasable | Wait. Nothing is charged until a quote arrives. |
 * | `purchasable` | A usable quote is live and nothing has been paid | The charge, with the server's own price on it |
 * | `pending` | An attempt exists and no verified callback has landed | Wait, and a re-read. **Never a second charge.** |
 * | `granted` | `ACTIVE` or `CONSUMED` | The quotes |
 * | `failed` | The provider reported a failure | A safe retry — the same idempotency key |
 * | `refunded` | The unlock was refunded (expiry, or every vendor fell through) | An explanation and no purchase |
 *
 * ## Why the unlock object outranks `is_available`
 *
 * `is_available` mirrors the server's *purchase* guard, and a stale `true` is
 * exactly the state a duplicate purchase lives in. Once an unlock record exists
 * it is the only thing that decides, in every direction: a `PENDING` unlock with
 * `is_available: true` beside it must read as pending, never as buyable.
 *
 * ## Why `unavailable` is tested before everything
 *
 * A null price with a live quote is a real and reachable state — the quote
 * arrived, and Operations has loaded no price for the variant. Reading that as
 * `purchasable` would render a checkout with no number on it.
 */
export type UnlockPhase =
  | "unavailable"
  | "not_yet"
  | "purchasable"
  | "pending"
  | "granted"
  | "failed"
  | "refunded";

export function unlockPhase(state: UnlockState): UnlockPhase {
  const unlock = state.unlock;
  if (unlock !== null) {
    switch (unlock.status) {
      case "PENDING":
        return "pending";
      case "ACTIVE":
      case "CONSUMED":
        return "granted";
      case "REFUNDED":
        return "refunded";
      case "FAILED":
        // A failed attempt is not a dead end. It falls through to whatever the
        // server says can be bought *now*, so the retry below is offered only
        // when a usable quote is still live and a price still exists.
        break;
    }
  }
  if (state.price_paise === null) return "unavailable";
  if (unlock !== null && unlock.status === "FAILED") return "failed";
  if (!state.is_available) return "not_yet";
  return "purchasable";
}

/**
 * Whether a poll of the unlock read can still learn something.
 *
 * Only `PENDING` is unsettled. Everything else is an answer the server has
 * already given, and polling a `not_yet` unlock would put a timer on a wave that
 * moves in hours. `boundedPoll` takes this directly.
 */
export function isUnlockSettled(state: UnlockState): boolean {
  return state.unlock === null || state.unlock.status !== "PENDING";
}

/** True once the server says the full quotes may be read. Never inferred locally. */
export function canReadFullQuotes(state: UnlockState): boolean {
  return state.can_read_full_quotes;
}

/* --------------------------------------------------------------------------
   The A5 visit plan
   -------------------------------------------------------------------------- */

/**
 * What the A5 screens may say, from the one read that serves both halves.
 *
 * | Phase | Means |
 * |---|---|
 * | `unpriced` | No plan, and `available_tiers` is empty — the honest unpriced state |
 * | `choosing` | No plan yet, tiers published: the review screen's chooser |
 * | `chosen` | A plan exists and **nothing has been charged** |
 * | `pending` | The plan checkout is in flight; the first slot is held, not scheduled |
 * | `active` | Charged. Visits are real bookings and estimates are readable |
 * | `failed` | The charge failed; the slot confirmation rolled back |
 * | `void` | The request closed before any vendor confirmed. Nothing was charged |
 * | `settled` | Every share is earned or refunded |
 *
 * `checkout_available` is deliberately *not* a phase. It is a separate server
 * fact that overlays `chosen` — "a vendor is holding a slot, this is now
 * payable" — and folding it in would have made the tracker unable to say that a
 * plan is chosen while the wave is still out.
 */
export type VisitPlanPhase =
  | "unpriced"
  | "choosing"
  | "chosen"
  | "pending"
  | "active"
  | "failed"
  | "void"
  | "settled";

export function visitPlanPhase(state: VisitPlanState): VisitPlanPhase {
  const plan = state.plan;
  if (plan === null) return state.available_tiers.length === 0 ? "unpriced" : "choosing";
  switch (plan.status) {
    case "CHOSEN":
      return "chosen";
    case "PENDING":
      return "pending";
    case "ACTIVE":
      return "active";
    case "FAILED":
      return "failed";
    case "VOID":
      return "void";
    case "SETTLED":
      return "settled";
    default:
      // A status this bundle does not recognise. Fails closed to the state that
      // offers nothing and promises nothing, on the same reasoning
      // `readScanStatus` gives: a value learned after this bundle shipped could
      // mean anything, and only "we cannot describe this" cannot do harm.
      return "unpriced";
  }
}

/** Poll only while the plan charge is in flight. See `isUnlockSettled`. */
export function isVisitPlanSettled(state: VisitPlanState): boolean {
  return state.plan === null || state.plan.status !== "PENDING";
}

/**
 * Whether the plan checkout may be opened.
 *
 * Both halves are required. `checkout_available` is the server's own guard —
 * a vendor holds a slot and the plan is not yet paid for — and a plan must
 * exist for there to be anything to pay for. The command re-checks
 * independently and answers `m2_visit_plan_not_chargeable`; this only decides
 * whether the control appears.
 */
export function canCheckOutVisitPlan(state: VisitPlanState): boolean {
  return state.plan !== null && state.checkout_available;
}

/** True once the server says the estimates may be read in full. */
export function canReadFullEstimates(state: VisitPlanState): boolean {
  return state.can_read_full_estimates;
}

/**
 * The share that funded one visit, by position.
 *
 * Shares and visits are two lists that describe the same slots, and the server
 * publishes no foreign key between them — `SiteVisit` carries no share id and no
 * partner. Position is what the plan's own arithmetic is defined on ("`plan
 * price / plan size` in integer paise, remainder on the first share"), so it is
 * the only join available, and it is exact for a plan whose visits arrive in
 * slot order.
 *
 * Returns null rather than guessing when the counts disagree. A share rendered
 * against the wrong visit would attribute money to the wrong professional, which
 * is worse on this screen than showing no money at all.
 */
export function shareForVisit(
  plan: VisitPlan | null,
  visits: readonly SiteVisit[],
  visitId: string,
): VisitPlanShare | null {
  if (plan === null) return null;
  const index = visits.findIndex((visit) => visit.id === visitId);
  if (index < 0) return null;
  return plan.shares[index] ?? null;
}

/* --------------------------------------------------------------------------
   Quotes and estimates
   -------------------------------------------------------------------------- */

/**
 * Whether a quote can still be chosen.
 *
 * `SUBMITTED` and nothing else, exactly as §3 of the state machine says: a
 * superseded, withdrawn, expired, rejected, selected, accepted or lapsed row
 * stays *readable* — the audit and the dispute both need it — and stays
 * unselectable. The server re-checks with `m2_proposal_not_selectable`; this
 * decides whether the control is offered.
 */
export function isSelectable(proposal: CustomerProposal): boolean {
  return proposal.status === "SUBMITTED";
}

/**
 * Whether the price has run out and re-validation is the way back.
 *
 * `EXPIRED` is the server's own status. It is deliberately not derived from
 * `valid_until` against a browser clock: a device an hour fast would offer
 * re-validation on a live quote and, worse, hide a live quote's Choose control.
 *
 * `revalidation_requested_at` is what stops the control being pressed twice —
 * the vendor answers by superseding, and that takes as long as it takes.
 */
export function isExpiredQuote(proposal: CustomerProposal): boolean {
  return proposal.status === "EXPIRED";
}

export function hasRequestedRevalidation(proposal: CustomerProposal): boolean {
  return proposal.revalidation_requested_at !== null;
}

/**
 * Whether this quote sits outside the budget band the Customer declared.
 *
 * A server verdict, published on every quote as `usability`. `M2-FE-405`
 * requires these to be **labelled, not hidden and not presented as ordinary
 * options** — hiding them would let the platform silently decide that a vendor
 * who quoted honestly above a guessed budget does not exist.
 */
export function isOutOfBudget(proposal: CustomerProposal): boolean {
  return proposal.usability === "OUT_OF_BUDGET";
}

/**
 * The vendor identity a paid Customer is entitled to — narrowed, never asserted.
 *
 * `CustomerProposal.vendor` is published as an untyped object
 * (`SerializerMethodField`), so the compiler checks nothing here at all. The
 * server sends `{partner_id, vendor_type, is_verified, display_name}`; every
 * field is read defensively and a missing one becomes null rather than
 * `undefined` reaching a component.
 *
 * **Contact details are absent at every status, by contract.** They are released
 * by the engagement and not by the fee, so there is nothing here to withhold —
 * and this narrowing is also what guarantees that a field the serializer starts
 * sending tomorrow does not reach the DOM without somebody deciding it should.
 */
export interface VendorIdentity {
  partnerId: string | null;
  vendorType: string | null;
  isVerified: boolean;
  displayName: string | null;
}

export function readVendorIdentity(vendor: unknown): VendorIdentity {
  const source =
    typeof vendor === "object" && vendor !== null && !Array.isArray(vendor)
      ? (vendor as Record<string, unknown>)
      : {};
  const text = (key: string): string | null => {
    const value = source[key];
    return typeof value === "string" && value !== "" ? value : null;
  };
  return {
    partnerId: text("partner_id"),
    vendorType: text("vendor_type"),
    // Verification defaults to false, not true. An unverified vendor shown as
    // verified is the one direction of this field that can hurt somebody.
    isVerified: source["is_verified"] === true,
    displayName: text("display_name"),
  };
}

/**
 * How many free non-responsive replacements are left, or null when unknowable.
 *
 * **Null is the state the screen must respect.** The cap is an owner decision
 * that has not been made, so `M2-FE-406` requires that no replacement is offered
 * at all — a control promising a free replacement visit on a rule that does not
 * exist would be the client inventing policy, and `POST .../reject/` answers
 * `m2_policy_unavailable` to prove it.
 */
export function replacementsRemaining(list: CustomerQuoteList): number | null {
  return list.non_responsive_rejections_remaining;
}

export function canRejectAsNonResponsive(list: CustomerQuoteList): boolean {
  const remaining = list.non_responsive_rejections_remaining;
  return remaining !== null && remaining > 0;
}

/* --------------------------------------------------------------------------
   Selection
   -------------------------------------------------------------------------- */

/**
 * Whether the Customer is waiting on a vendor who has not agreed yet.
 *
 * `M2-FE-411`'s whole content: selection starts a reconfirmation clock and the
 * engagement opens only when the vendor commits. A screen that reads
 * `PENDING_RECONFIRMATION` as booked sends somebody to sit at home on a day
 * nobody agreed to.
 */
export function isAwaitingVendor(selection: ProposalSelection): boolean {
  return selection.status === "PENDING_RECONFIRMATION";
}

/**
 * Whether the vendor said no, or ran out of time.
 *
 * The two are one state for the Customer because the next step is identical and
 * the guarantee is identical: **the entitlement survives and the next quote
 * costs nothing more.** They are separate on the server because a vendor reading
 * their own timeout as a rejection would be told the wrong story about their own
 * standing.
 */
export function isVendorRefused(selection: ProposalSelection): boolean {
  return selection.status === "DECLINED" || selection.status === "EXPIRED";
}

/** Whether the vendor committed and an engagement now exists. */
export function isEngagementOpen(selection: ProposalSelection): boolean {
  return selection.status === "CONFIRMED" && selection.engagement_id !== null;
}

/**
 * Whether another selection may be started.
 *
 * `M2-FE-414`. A live selection blocks a second one — the server refuses with
 * `m2_selection_conflict` — and a settled one does not, because a declined or
 * expired vendor is exactly the case the guarantee exists for.
 */
export function blocksNewSelection(selection: ProposalSelection | null): boolean {
  if (selection === null) return false;
  return selection.status === "PENDING_RECONFIRMATION" || selection.status === "CONFIRMED";
}

/**
 * A selection read that answers `404`, meaning nothing has been chosen.
 *
 * Not an error and not a missing record: the endpoint answers `404` when the
 * requirement has no live selection, which is the ordinary state of every
 * requirement before somebody chooses. Callers turn it into `null`.
 */
export function isNoSelection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/* --------------------------------------------------------------------------
   Visits
   -------------------------------------------------------------------------- */

/**
 * What one plan slot is doing, as the tracker renders it.
 *
 * `held` is the state this whole flow turns on and it has no status of its own:
 * a visit reads `REQUESTED` while the plan is unpaid, because the vendor has
 * committed to a time and **the Customer has not bought it yet**. Rendering that
 * as scheduled would promise a vendor a job nobody has paid for and promise the
 * Customer a visit that lapses harmlessly if they never pay.
 */
export type VisitSlotState =
  | "held"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "vendor_no_show"
  | "customer_no_show";

export function visitSlotState(visit: SiteVisit, planIsCharged: boolean): VisitSlotState {
  switch (visit.status) {
    case "REQUESTED":
      // A `REQUESTED` visit on a charged plan is a scheduling record the server
      // has not hardened yet; on an unpaid plan it is the hold. Only the plan
      // can tell the two apart, which is why it is a parameter.
      return planIsCharged ? "scheduled" : "held";
    case "SCHEDULED":
      return "scheduled";
    case "IN_PROGRESS":
      return "in_progress";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "VENDOR_NO_SHOW":
      return "vendor_no_show";
    case "CUSTOMER_NO_SHOW":
      return "customer_no_show";
    default:
      return "cancelled";
  }
}

/**
 * Whether arrival can be confirmed for this visit.
 *
 * Both parties may confirm, through the **non-OTP fallback, which is the default
 * path in M2 and not a degraded one** — the start OTP is M3 activation. The
 * server refuses anything that is not scheduled, including a held slot on an
 * unpaid plan, so this mirrors that guard rather than inventing one.
 */
export function canConfirmArrival(visit: SiteVisit, planIsCharged: boolean): boolean {
  return visitSlotState(visit, planIsCharged) === "scheduled";
}

/**
 * Whether the Customer may report that the professional did not turn up.
 *
 * The party is not a choice. **You report the other party's absence, never your
 * own** — a Customer reports `VENDOR`, and the server answers `403` to the
 * reverse. So no screen in this app ever offers a party control, and this
 * function exists to gate one button.
 */
export function canReportVendorNoShow(visit: SiteVisit, planIsCharged: boolean): boolean {
  const state = visitSlotState(visit, planIsCharged);
  return state === "scheduled" || state === "in_progress";
}

/** The only party a Customer is permitted to report. */
export const CUSTOMER_REPORTS_PARTY: VisitNoShowParty = "VENDOR";
