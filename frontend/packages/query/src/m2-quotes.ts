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
/** A Customer's ask for a different estimate (contract 1.47.0). Carries no price. */
export type RevisionRequest = Schemas["RevisionRequest"];
export type RevisionRequestReasonCode = Schemas["RevisionRequestReasonCodeEnum"];
/** One clarification question and its single answer, in either direction. */
export type RequirementQuestion = Schemas["RequirementQuestion"];
export type RequirementQuestionList = Schemas["RequirementQuestionList"];
export type ProposalStage = Schemas["ProposalStage"];
export type ProposalMaterialLine = Schemas["ProposalMaterialLine"];
export type ProposalItemLine = Schemas["ProposalItemLine"];
export type ProposalLabourLine = Schemas["ProposalLabourLine"];
export type ProposalOtherCharge = Schemas["ProposalOtherCharge"];
export type EstimateType = Schemas["EstimateTypeEnum"];
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
 * Cache keys for the 1.24.0 reads, three of them published and one still not.
 *
 * **The visit plan moved at the Wave I gate.** It was composed here, nested
 * under `m2QueryKeys.requirements.detail(id)`, because `m2-keys.ts` predated
 * revision 3 and is frozen. The §7 request was granted: the factory now carries
 * a `visits` namespace, `visits.plan(requirementId)` is keyed by requirement for
 * exactly the reason argued for the unlock, and `requirementScope` lists it — so
 * a `NON_RESPONSIVE` rejection now correctly refetches the plan whose share it
 * sent back to owing a free replacement visit. **Delegating rather than keeping
 * the local composition is the point**: two names for one cache entry is how the
 * customer's tracker and the server's own invalidation stop agreeing.
 *
 * `selection` is still composed locally and still nests under
 * `requirements.detail(id)`. Nesting is the load-bearing part rather than
 * tidiness: `M2_INVALIDATION`'s `requirementScope` invalidates that key as a
 * *prefix*, so selecting or rejecting a proposal clears the selection beneath it
 * without a row being edited in the file nobody may edit.
 *
 * The unlock, the teasers and the quotes all keep their published keys.
 * Promotion of `selection` is still requested in `frontend-execution-plan.md` §7.
 */
export const m2AccessKeys = {
  /** `GET /requirements/{id}/unlock/` — A3. */
  unlock: (requirementId: string) => m2QueryKeys.unlock.forRequirement(requirementId),
  /**
   * `GET /requirements/{id}/visit-plan/` — A5's chooser and its tracker in one read.
   *
   * The published key, not a local composition. See the note above.
   */
  visitPlan: (requirementId: string) => m2QueryKeys.visits.plan(requirementId),
  /** `GET /requirements/{id}/quotes/teasers/` — A3, pre-unlock. */
  teasers: (requirementId: string) => m2QueryKeys.proposals.teasers(requirementId),
  /** `GET /requirements/{id}/quotes/` — the full quotes or estimates, post-entitlement. */
  quotes: (requirementId: string) => m2QueryKeys.proposals.unlocked(requirementId),
  /** `GET /requirements/{id}/selection/` — the live selection, or none. */
  selection: (requirementId: string) =>
    [...m2QueryKeys.requirements.detail(requirementId), "selection"] as const,
  /**
   * `GET /site-visits/{id}/arrival-code/` — the code the Customer reads out.
   *
   * Keyed on the visit rather than under the plan, because it is the one read on
   * these screens that is not derived from the plan: it expires on its own
   * clock, it is issued and re-issued independently, and folding it into the
   * plan key would make every plan refetch pull a code nobody is looking at.
   */
  visitArrivalCode: (siteVisitId: string) =>
    [...m2QueryKeys.visits.all, "arrival-code", siteVisitId] as const,
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

/**
 * Poll while the visit plan can still move because somebody else acts.
 *
 * `PENDING` is the payment callback window. `CHOSEN` is the matching window:
 * no money has moved, but a Partner can confirm a visit slot from another
 * session and flip `checkout_available` plus the visit rows while the Customer
 * is staring at the request. Stopping here leaves the tracker saying "Waiting
 * for a professional" until a manual refresh.
 */
export function isVisitPlanSettled(state: VisitPlanState): boolean {
  return state.plan === null || !["CHOSEN", "PENDING"].includes(state.plan.status);
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
  /**
   * What a Customer may weigh before choosing (contract 1.47.0). Read at request
   * time from completed engagements and Customer ratings; never an input to
   * matching. `ratingAverage` is null until somebody has rated this vendor —
   * a star count nobody gave is the one thing this must not invent.
   */
  ratingAverage: number | null;
  ratingCount: number;
  jobsCompleted: number;
  experienceYears: number;
  /** ISO date the vendor joined, or null on a payload that predates 1.47.0. */
  activeSince: string | null;
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
  const count = (key: string): number => {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const rating = source["rating_average"];
  return {
    partnerId: text("partner_id"),
    vendorType: text("vendor_type"),
    // Verification defaults to false, not true. An unverified vendor shown as
    // verified is the one direction of this field that can hurt somebody.
    isVerified: source["is_verified"] === true,
    displayName: text("display_name"),
    ratingAverage:
      typeof rating === "number" && Number.isFinite(rating) && rating > 0 ? rating : null,
    ratingCount: count("rating_count"),
    jobsCompleted: count("jobs_completed"),
    experienceYears: count("experience_years"),
    activeSince: text("active_since"),
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

/* ==========================================================================
   The A3 rate-card front door — contract 1.29.0, revision 4 (ADR-0009)
   ==========================================================================

   The instant path: a published day rate, a crew offer cascade, and one online
   charge. It lives in this module rather than a new one for the reason the
   header gives — A3 and A5 sell different things through the same shape, and
   `isAccessPriceUnavailable` / `isPolicyUnavailable` are the fail-closed
   refusals both doors share.

   ## The rule that decides every function below

   **A3 is `LEAD_ONLY` and the booking fee is the only money Vsolve touches.**
   `total_customer_paise = lead_receipt_paise + booking_fee_paise`, the server
   calculates all three, and the wage half is paid direct to the lead at day end
   and never held by us. Nothing here computes a component: `RateCard` publishes
   the three parts separately precisely so neither side has to infer them, and a
   client that multiplied a day rate by a headcount would eventually disagree
   with the number the Customer agreed to.

   ## `m2_booking_fee_payment_pending` is declared and raised by nothing

   The contract names it (202, retryable) and no path returns it today —
   recorded in `contracts/openapi/CHANGELOG.md` §1.29.0 and in the execution plan
   §7. So the pending state is derived from the `BookingFee` object's own
   `PENDING` status, exactly as `unlockPhase` derives its own, and never from a
   refusal code. Building the wait on a code nothing sends would be a screen that
   never reaches the state it was written for.
   -------------------------------------------------------------------------- */

export type RateCardState = Schemas["RateCardState"];
export type RatePreview = Schemas["RatePreview"];
export type RateCardBooking = Schemas["RateCardBooking"];
export type RateCardBookingStatus = Schemas["RateCardBookingStatusEnum"];
export type BookingFee = Schemas["BookingFee"];
export type BookingFeeStatus = Schemas["BookingFeeStatusEnum"];
export type CrewNoShowReason = Schemas["CrewNoShowRequest"]["reason_code"];
export type CrewNoShowParty = Schemas["CrewNoShowRequest"]["party"];

/**
 * The rate-card read's cache key.
 *
 * Composed locally and nested under `requirements.detail(id)`, on the Wave A2
 * precedent: `m2-keys.ts` predates revision 4 and is frozen, so the alternative
 * to composing it here is editing a file this session may not touch. Nesting is
 * the load-bearing part rather than tidiness — `M2_INVALIDATION`'s
 * `requirementScope` invalidates `requirements.detail(id)` as a *prefix*, so
 * every existing requirement-level invalidation already clears this. Promotion
 * to the factory is requested in `frontend-execution-plan.md` §7.
 *
 * Keyed by **requirement**, exactly as `unlock` and `visits.plan` are and for
 * the same reason: a Customer coming back from a lost payment redirect holds a
 * requirement id and nothing else, and keying a purchase by an id the recovery
 * path cannot produce is how somebody who has paid cannot find what they bought.
 */
export const m2RateCardKeys = {
  state: (requirementId: string) =>
    [...m2QueryKeys.requirements.detail(requirementId), "rate-card"] as const,
  /**
   * The same read, priced at a size the draft has not been saved at.
   *
   * The booking screen puts the rate beside the form and keeps it correct as the
   * Customer changes how many people they need, so it asks the server for a
   * price per size rather than writing a draft on every press of a stepper.
   *
   * **Nested under `state`, which is the load-bearing part.** Every existing
   * invalidation of `state(id)` matches this as a prefix, so a booking, a cancel
   * or a no-show clears the sized previews too — without which the rail could go
   * on quoting a rate card that has since been superseded. It is a separate
   * entry rather than the same one because `setQueryData(state(id), ...)` in the
   * book mutation writes a *booked* state, and that must not land in a cache
   * slot the form is reading a price out of.
   */
  preview: (requirementId: string, headcount: number, days: number) =>
    [
      ...m2QueryKeys.requirements.detail(requirementId),
      "rate-card",
      "preview",
      headcount,
      days,
    ] as const,
} as const;

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

/**
 * `409 m2_rate_card_unavailable` — no published card for this city and skill.
 *
 * **Fail-closed, and the failure is the product decision.** No card means no
 * instant booking and never a guessed price; the honest degradation is the quote
 * flow, which is still built and is still there. Also raised when the service
 * area carries no `state_code`, because the wage-floor check cannot run without
 * one and a guard that silently skips is indistinguishable from one that passed.
 *
 * Not retryable. Nothing the Customer can press publishes a rate.
 */
export function isRateCardUnavailable(error: unknown): boolean {
  return hasCode(error, "m2_rate_card_unavailable");
}

/**
 * `409 m2_booking_fee_not_chargeable` — there is nothing to pay for.
 *
 * No lead is holding the job, the hold lapsed, or the fee is already settled.
 * The Customer cannot make a lead accept, so the only next step is to wait —
 * which is why no screen offers a retry against it.
 */
export function isBookingFeeNotChargeable(error: unknown): boolean {
  return hasCode(error, "m2_booking_fee_not_chargeable");
}

/** `409 m2_roster_insufficient` — a lead's verified roster is smaller than the headcount. */
export function isRosterInsufficient(error: unknown): boolean {
  return hasCode(error, "m2_roster_insufficient");
}

/* --------------------------------------------------------------------------
   The published rate, before anything is booked
   -------------------------------------------------------------------------- */

/**
 * Whether a rate can be shown at all — and unavailability is a `200`, not an error.
 *
 * `GET .../rate-card/` publishes unavailability as a **state on a successful
 * read**, deliberately: an A3 Customer whose city has no published card can
 * still send their request, it simply collects quotes. Refusing the whole screen
 * would hide a path that works.
 *
 * Every money field is checked, not just the flag. A rate is four numbers the
 * screen has to print, and `is_available` with a null total is a screen with a
 * heading and no price on it — which is the one thing a rate disclosure may
 * never be.
 */
export function isRatePublished(preview: RatePreview): boolean {
  return (
    preview.is_available &&
    preview.total_customer_paise !== null &&
    preview.lead_receipt_paise !== null &&
    preview.booking_fee_paise !== null &&
    preview.day_rate_paise !== null
  );
}

/**
 * Why the preset itself is incomplete, as distinct from why the city is unpriced.
 *
 * The read reports a draft with no headcount or day count through the same
 * `is_available: false` channel as an unpriced city, under its own code. Told
 * apart here because the two need opposite screens: one asks the Customer for a
 * number they can supply, the other says we cannot sell this here at all and
 * must never look like something they can fix.
 *
 * **A missing or empty code is not an incomplete preset.** `unavailable_code` is
 * nullable, and a `null` means the server declined to say why — which is exactly
 * when guessing costs the most. Sending somebody back to a form they have
 * already filled in, over and over, is the worse of the two wrong answers; the
 * fail-closed branch at least tells them the truth (we have no published rate
 * here) and hands them the quote flow, which works. So this requires a named
 * code that is neither of the two fail-closed ones, rather than merely not being
 * them.
 */
export function isPresetIncomplete(preview: RatePreview): boolean {
  const code = preview.unavailable_code;
  return (
    !preview.is_available &&
    code !== null &&
    code !== "" &&
    code !== "m2_rate_card_unavailable" &&
    code !== "m2_policy_unavailable"
  );
}

/* --------------------------------------------------------------------------
   The booking, through the cascade
   -------------------------------------------------------------------------- */

/**
 * Where one instant booking stands, from the server's own record.
 *
 * | Phase | Means | What the screen offers |
 * |---|---|---|
 * | `unbooked` | No booking exists | The preset and the rate, if there is one |
 * | `matching` | The cascade is out. Nothing has been charged | The holding state, and nothing to press |
 * | `offer_held` | A lead accepted and is holding the job | The booking-fee checkout, and only here |
 * | `confirmed` | Fee verified; the crew and the engagement exist | The engagement |
 * | `fell_back` | The threshold passed. This request is on the quote flow now | The unlock surface, with the handoff explained |
 * | `cancelled` | Called off | The money outcome, from the fee |
 *
 * A status this build does not recognise falls to `unbooked`, on
 * `readScanStatus`'s reasoning: a value learned after this bundle shipped could
 * mean anything, and only "we cannot describe this" cannot do harm.
 */
export type RateCardBookingPhase =
  | "unbooked"
  | "matching"
  | "offer_held"
  | "confirmed"
  /**
   * Nobody accepted, and the request is **waiting on the Customer**.
   *
   * Distinct from `fell_back` on purpose. The cascade used to hand an unmet job
   * to the quote flow by itself, which changed the product the Customer had
   * asked for without asking them. It now stops here, changes nothing, and
   * offers three ways out — search wider, take quotes instead, or cancel.
   *
   * This is the only crew phase with anything to press, which is why it is the
   * only one that can be reached and then left in more than one direction.
   */
  | "exhausted"
  | "fell_back"
  | "cancelled";

export function bookingPhase(state: RateCardState): RateCardBookingPhase {
  const booking = state.booking;
  if (booking === null) return "unbooked";
  switch (booking.status) {
    case "MATCHING":
      return "matching";
    case "OFFER_HELD":
      return "offer_held";
    case "CONFIRMED":
      return "confirmed";
    case "EXHAUSTED":
      return "exhausted";
    case "FELL_BACK":
      return "fell_back";
    case "CANCELLED":
      return "cancelled";
    default:
      return "unbooked";
  }
}

/**
 * Whether this requirement has been handed to the quote flow.
 *
 * The one predicate the fallback handoff turns on. `FELL_BACK` is a real,
 * recorded transition with a `fallback_reason_code` and a timestamp — not an
 * absence — and **nothing has been charged when it happens**. The already-built
 * unlock and teaser surface is what renders next; it is the thin-supply fallback
 * and it stays.
 */
export function hasFallenBackToQuotes(state: RateCardState): boolean {
  return bookingPhase(state) === "fell_back";
}

/* --------------------------------------------------------------------------
   The booking fee — §4c, the money spec
   -------------------------------------------------------------------------- */

/**
 * What the money did, read off the `BookingFee` record and nothing else.
 *
 * | Phase | `BookingFee.status` | Means |
 * |---|---|---|
 * | `none` | (no record) | Nothing has been charged and nothing is owed |
 * | `awaiting_payment` | `OFFER_ACCEPTED` | A lead is holding the job; the checkout is open |
 * | `pending` | `PENDING` | An attempt exists and no verified callback has landed. Nothing to press |
 * | `active` | `ACTIVE` | Paid and verified. The crew is confirmed |
 * | `earned` | `EARNED` | The crew arrived on day one |
 * | `forfeited` | `FORFEIT_SPLIT` | Customer no-show, locked gate or late cancel — split with the lead |
 * | `refunded` | `REFUNDED` | Returned in full: vendor no-show, a free-window cancel, or expiry |
 * | `failed` | `FAILED` | The provider reported a failure. A safe retry, same key |
 *
 * **Never derived from a refusal code.** `m2_booking_fee_payment_pending` is
 * declared and returned by no path, so a `pending` screen built on it would
 * never render. This reads the aggregate, which is also the whole recovery path:
 * a Customer who closed the tab mid-UPI holds a requirement id and this answers
 * from that alone.
 *
 * ## `awaiting_payment` is reachable
 *
 * `hold_booking_fee` (`backend/apps/requirements/booking_fees.py`) opens the
 * fee in `OFFER_ACCEPTED` the moment a lead takes the job, so while a lead holds
 * it the read carries a fee and this answers `awaiting_payment`. (Until that
 * writer existed the row was absent and this answered `none` — the gap Session
 * C logged in `frontend-execution-plan.md` §7 on 14 August, since closed.)
 *
 * Even so, no *screen* is gated on this phase: "may I pay now" is answered by
 * `RateCardState.checkout_available`, which is the field that knows, and
 * {@link canCheckOutBookingFee} is the only predicate any control uses.
 */
export type BookingFeePhase =
  | "none"
  | "awaiting_payment"
  | "pending"
  | "active"
  | "earned"
  | "forfeited"
  | "refunded"
  | "failed";

export function bookingFeePhase(state: RateCardState): BookingFeePhase {
  const fee = state.booking_fee;
  if (fee === null) return "none";
  switch (fee.status) {
    case "OFFER_ACCEPTED":
      return "awaiting_payment";
    case "PENDING":
      return "pending";
    case "ACTIVE":
      return "active";
    case "EARNED":
      return "earned";
    case "FORFEIT_SPLIT":
      return "forfeited";
    case "REFUNDED":
      return "refunded";
    case "FAILED":
      return "failed";
    default:
      // Same fail-closed direction as everywhere else: an unrecognised status
      // offers nothing and promises nothing.
      return "none";
  }
}

/**
 * Whether the fee checkout may be opened.
 *
 * `checkout_available` is the server's own guard — a lead is holding this job
 * *right now* and the fee is not yet settled — and a booking must exist for
 * there to be anything to pay for. Mirrored, never trusted as permission: the
 * command re-checks under the booking's row lock and answers
 * `m2_booking_fee_not_chargeable`, because a hold that lapsed a second ago is
 * exactly the state a stale `true` lives in.
 */
export function canCheckOutBookingFee(state: RateCardState): boolean {
  return state.booking !== null && state.checkout_available;
}

/**
 * Whether a poll of the rate-card read can still learn something.
 *
 * Two unsettled states rather than one, and the second is what makes the cascade
 * holding state honest:
 *
 * - **A fee in `PENDING`.** The verified callback can land seconds after the
 *   Customer returns from the provider, minutes later on a UPI collect, or after
 *   the tab has been closed and reopened.
 * - **A booking still `MATCHING` or `OFFER_HELD`.** Unlike a quote wave, which
 *   moves in hours, the A3 cascade runs on the M1 dispatch clock in *minutes* —
 *   the offer timeout is seconds-to-minutes and the hold is quarter-hours. A
 *   screen that said "confirming your crew" and never changed without a manual
 *   refresh would be the holding state lying about being live.
 *
 * Everything else is an answer the server has already given.
 */
export function isRateCardSettled(state: RateCardState): boolean {
  if (state.booking_fee !== null && state.booking_fee.status === "PENDING") return false;
  const phase = bookingPhase(state);
  return phase !== "matching" && phase !== "offer_held";
}

/**
 * Whether the Customer may still call this booking off.
 *
 * Offered against a fee that exists and has not settled. **This client never
 * decides which way the money goes** — the free-cancel window T is server
 * configuration, `POST .../booking-fee/cancel/` reads it fail-closed, and while
 * it is unset the command refuses with `m2_policy_unavailable` rather than
 * guessing between a refund and a forfeit. So the control is offered and the
 * outcome is the server's to state.
 *
 * Reached in `awaiting_payment` (a lead is holding the job and
 * `hold_booking_fee` has opened the fee) and in `active`. With no fee row —
 * the booking still out to the cascade — cancel answers
 * `m2_booking_fee_not_chargeable`, so the control is not offered there; that
 * Customer has **no** published way to call it off, because no
 * requirement-level cancel exists for `MATCHING` either (execution plan §7).
 */
export function canCancelBooking(state: RateCardState): boolean {
  const phase = bookingFeePhase(state);
  return phase === "awaiting_payment" || phase === "active";
}

/**
 * Whether day one can be recorded — arrival, or a no-show.
 *
 * Only against a paid, verified booking. `ACTIVE` is the one status where the
 * crew is confirmed and the day has not been settled either way; `EARNED` means
 * arrival was already confirmed, and confirming twice is not a state the
 * Customer needs a button for.
 */
export function canRecordCrewDay(state: RateCardState): boolean {
  return bookingFeePhase(state) === "active";
}

/**
 * The only party a Customer is permitted to report on the crew path.
 *
 * The same rule as the visit no-show, and a **separate constant on purpose**:
 * the crew endpoint reuses `VisitNoShowPartyEnum` (one question, two answers,
 * and a second vocabulary for it is how two names for one fact start
 * disagreeing), but the server does not enforce direction here the way the visit
 * path does — `party` decides the money and `report_crew_no_show` takes whatever
 * it is given. So the value is fixed at the one call site that could set it, and
 * no control in this app can produce `CUSTOMER`.
 */
export const CUSTOMER_REPORTS_CREW_PARTY: CrewNoShowParty = "VENDOR";

/** The reason a Customer reports when nobody arrived. Published vocabulary, not a slug. */
export const CREW_VENDOR_NO_SHOW_REASON: CrewNoShowReason = "vendor_no_show";
