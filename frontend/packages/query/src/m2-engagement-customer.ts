/**
 * The Customer's half of the engagement spine — contract 1.25.0.
 *
 * One `Engagement` and its ordered `EngagementStage`s, read through the
 * Customer's own routes. A3 and A5 run on the same spine (ADR-0007), so there is
 * no archetype branch below: what differs is `commercial_mode`, and that is a
 * published field rather than something a client derives.
 *
 * ## Why the Customer and Partner halves are separate modules
 *
 * `frontend-execution-plan.md` §3 sets this: both roles read the same spine
 * through role-scoped endpoints with different permitted actions, and two thin
 * hook files sharing one key factory beat one shared file two sessions fight
 * over. Real duplication gets folded at the Wave 4 sync.
 *
 * ## The one field a screen must read before it promises anything
 *
 * `commercial_mode`. `LEAD_ONLY` means the Customer pays the vendor directly and
 * Vsolve's protection is matching and replacement — **not a protected booking**,
 * and the UI must not describe it as one. `MANAGED_PAYMENT_REQUIRED` funds one
 * stage at a time, **at face value**: there is no stage credit, because the
 * visit-plan money was spent on the visits themselves and discounting a stage by
 * it would pay for those visits twice out of the vendor's work.
 *
 * It is published rather than inferred for the reason contract 1.21.0 gives:
 * inferring it from the archetype is tempting and wrong, because it is the field
 * that decides whether the UI promises protection, and a client that computes it
 * keeps promising protection straight through a policy change.
 *
 * ## Nothing here sums money the server has already added up
 *
 * 1.25.0 publishes six running totals on the engagement and four per stage,
 * precisely so no client has to. `fundedTotalPaise` — which summed `FUNDED`
 * stage amounts at 1.24.0 and was logged in §7 as the gap that forced it — is
 * **gone**, replaced by `engagement.funded_total_paise`. A number a client
 * computes is a number that can disagree with a statement, and this surface is
 * one where that disagreement is a dispute.
 *
 * The one thing still counted here is `stageProgress`, and it counts **statuses,
 * not rupees**: money progress reads 0% for a completed A3 booking, because
 * `LEAD_ONLY` collects nothing, and a progress bar that says a finished job is
 * 0% done is worse than none.
 */

import { ApiRequestError } from "@vsolve/api-client";
import type { Schemas } from "@vsolve/api-client";

export type Engagement = Schemas["Engagement"];
export type EngagementPage = Schemas["EngagementPage"];
export type EngagementStage = Schemas["EngagementStage"];
export type EngagementStatus = Schemas["EngagementStatusEnum"];
export type EngagementStageStatus = Schemas["EngagementStageStatusEnum"];
export type EngagementStageFundingState = Schemas["EngagementStageFundingStateEnum"];
export type EngagementCommercialMode = Schemas["EngagementCommercialModeEnum"];

export type StageEvidence = Schemas["StageEvidence"];
export type StageEvidenceKind = Schemas["StageEvidenceKindEnum"];
export type StageEvidenceScanStatus = Schemas["RequirementScanStatusEnum"];
export type StageDisputeReason = Schemas["StageDisputeReasonEnum"];

export type EngagementAmendment = Schemas["EngagementAmendment"];
export type EngagementAmendmentList = Schemas["EngagementAmendmentList"];
export type EngagementAmendmentDecision = Schemas["EngagementAmendmentDecision"];
export type EngagementAmendmentKind = Schemas["EngagementAmendmentKindEnum"];
export type AmendmentLine = Schemas["AmendmentLine"];
export type AmendmentStatus = Schemas["ScopeAmendmentStatusEnum"];

export type EngagementEvent = Schemas["EngagementEvent"];
export type EngagementEventList = Schemas["EngagementEventList"];

/* --------------------------------------------------------------------------
   Commercial mode
   -------------------------------------------------------------------------- */

/**
 * A3: the Customer pays the vendor directly and Vsolve holds no service money.
 *
 * `M2-FE-415` and `M2-FE-509` both turn on this and nothing else. Every claim
 * either screen makes — who is paid, who refunds, who carries the warranty — is
 * decided here, and the honest sentence is that service payment, service refunds
 * and warranty are between the Customer and the vendor.
 */
export function isLeadOnly(engagement: Engagement): boolean {
  return engagement.commercial_mode === "LEAD_ONLY";
}

/** A5: staged funding through Vsolve, one stage at a time, at face value. */
export function isManagedPayment(engagement: Engagement): boolean {
  return engagement.commercial_mode === "MANAGED_PAYMENT_REQUIRED";
}

/**
 * Whether this build recognises the mode at all.
 *
 * A third mode reaching an older bundle must render as "we cannot describe this"
 * rather than falling back to either — one fallback would promise protection
 * that does not exist and the other would deny protection that does. Same
 * fail-closed rule the workspace registry applies to an unknown workspace key.
 */
export function isKnownCommercialMode(engagement: Engagement): boolean {
  return isLeadOnly(engagement) || isManagedPayment(engagement);
}

/* --------------------------------------------------------------------------
   Stages: order, funding and the review clock
   -------------------------------------------------------------------------- */

/** The stages in the order the agreement lays them out. Never wire order. */
export function orderedStages(engagement: Engagement): readonly EngagementStage[] {
  return [...engagement.stages].sort((left, right) => left.position - right.position);
}

/**
 * The stage the Customer is being asked to fund, or null.
 *
 * **Ordered, and only ever one.** `POST /engagement-stages/{id}/funding/`
 * refuses with `m2_stage_not_funded` when an earlier stage is unfunded, so
 * offering a later stage's button would be offering a refusal. Projects collect
 * one stage at a time and never the full project value merely because a proposal
 * was accepted — that rule lives on the server and this is the client agreeing
 * with it rather than a second implementation of it.
 *
 * `PENDING` funding state is deliberately not fundable: an attempt is already in
 * flight and a second checkout against it is the duplicate charge this whole
 * wave is written to prevent.
 */
export function nextFundableStage(engagement: Engagement): EngagementStage | null {
  if (!isManagedPayment(engagement)) return null;
  for (const stage of orderedStages(engagement)) {
    if (stage.funding_state === "FUNDED" || stage.funding_state === "NOT_REQUIRED") continue;
    // The first stage that is not settled decides, whatever it is. If it is
    // already `PENDING` the answer is "nothing to fund right now", not "skip to
    // the next one" — the next one is refused until this one lands.
    return stage.funding_state === "REQUIRED" ? stage : null;
  }
  return null;
}

/** A funding charge is in flight on some stage. Wait; never start a second. */
export function hasFundingInFlight(engagement: Engagement): boolean {
  return engagement.stages.some((stage) => stage.funding_state === "PENDING");
}

/**
 * Whether a poll of the engagement read can still learn something.
 *
 * Only while a stage funding charge is unresolved. Everything else about an
 * engagement moves on the vendor's schedule — days, not seconds — and polling it
 * would be a timer on a record that changes when somebody does some work.
 */
export function isEngagementSettled(engagement: Engagement): boolean {
  return !hasFundingInFlight(engagement);
}

/**
 * The stage the Customer is being asked to look at, or null.
 *
 * `AWAITING_REVIEW` is the state with a clock attached, so it outranks every
 * other. Two stages can be awaiting review at once on an A3 engagement — one
 * shift-day per stage, and a supervisor can submit two days late — and the
 * earliest is the one whose window closes first.
 */
export function stageAwaitingReview(engagement: Engagement): EngagementStage | null {
  return orderedStages(engagement).find((stage) => stage.status === "AWAITING_REVIEW") ?? null;
}

/** Every stage currently awaiting the Customer, earliest first. */
export function stagesAwaitingReview(engagement: Engagement): readonly EngagementStage[] {
  return orderedStages(engagement).filter((stage) => stage.status === "AWAITING_REVIEW");
}

/** Stages with an open dispute. A dispute stops one allocation, never the job. */
export function disputedStages(engagement: Engagement): readonly EngagementStage[] {
  return orderedStages(engagement).filter((stage) => stage.status === "DISPUTED");
}

/**
 * The stage the work is actually on, or null when every stage is settled.
 *
 * "Settled" is `APPROVED` or `RELEASED` — the two states in which the Customer
 * has nothing left to do and the vendor has nothing left to submit.
 */
export function activeStage(engagement: Engagement): EngagementStage | null {
  return (
    orderedStages(engagement).find(
      (stage) => stage.status !== "APPROVED" && stage.status !== "RELEASED",
    ) ?? null
  );
}

/**
 * How far along the work is, counted in stages rather than in money.
 *
 * Deliberately not derived from `released_total_paise / staged_total_paise`: on
 * a `LEAD_ONLY` engagement the platform collects nothing, so every money ratio
 * is zero for the whole job and a bar built on one would tell an A3 Customer
 * their finished booking had not started.
 *
 * No published field carries this. It is the one derivation left in this module
 * and it reads only server-stamped statuses. Logged in §7.
 */
export function stageProgress(engagement: Engagement): { done: number; total: number } {
  const total = engagement.stages.length;
  const done = engagement.stages.filter(
    (stage) => stage.status === "APPROVED" || stage.status === "RELEASED",
  ).length;
  return { done, total };
}

/* --------------------------------------------------------------------------
   The review clock — the reason `stage` is on the EXPIRING_STATE tier
   -------------------------------------------------------------------------- */

/**
 * What the review deadline on a stage actually means.
 *
 * Three states, and conflating any two of them moves money without consent:
 *
 * - **`auto_approves`** — the stage is `AWAITING_REVIEW`, `review_due_at` is
 *   set, and silence approves it when the window closes. This is a clock running
 *   *against* the Customer and it must be on screen. A silent auto-approval
 *   nobody was warned about is money moving without consent.
 * - **`no_deadline`** — the stage is `AWAITING_REVIEW` and `review_due_at` is
 *   **null**. That null is a policy state, not missing data: no review window is
 *   configured, so this stage will **never** auto-approve. It must never render
 *   as time in hand, and a default must never be synthesised — the value is
 *   owner-blocked and fails closed on purpose.
 * - **`stopped`** — the stage is `DISPUTED`. `AWAITING_REVIEW → APPROVED` on
 *   timeout is refused while disputed (`409 m2_stage_disputed`) and the server
 *   clears `review_due_at` so the sweep cannot see it. **Disputing is the action
 *   that stops the clock**, and the screen offering the dispute is the place to
 *   say so.
 * - **`not_running`** — no review is open at all.
 */
export type ReviewClock = "auto_approves" | "no_deadline" | "stopped" | "not_running";

export function reviewClock(stage: EngagementStage): ReviewClock {
  if (stage.status === "DISPUTED") return "stopped";
  if (stage.status !== "AWAITING_REVIEW") return "not_running";
  return stage.review_due_at === null ? "no_deadline" : "auto_approves";
}

/**
 * The instant this stage is approved by silence, or null.
 *
 * Null for every reason there is to be null — no review open, no window
 * configured, or a dispute that stopped the clock. Callers render a countdown
 * only for a non-null answer and say why for each of the others; that is what
 * `reviewClock` is for.
 */
export function autoApprovalDeadline(stage: EngagementStage): string | null {
  return reviewClock(stage) === "auto_approves" ? stage.review_due_at : null;
}

/**
 * When the vendor's approved earning stops being held, or null.
 *
 * Null means no payout hold is configured, so the payout does not release on a
 * clock at all. Same rule as the review window: render nothing rather than a
 * countdown to a deadline nobody set. Only ever meaningful on a managed
 * engagement — `LEAD_ONLY` holds no money to release.
 */
export function payoutReleaseDeadline(stage: EngagementStage): string | null {
  return stage.payout_release_due_at;
}

/* --------------------------------------------------------------------------
   Permitted stage actions — the client agreeing with the server, not deciding
   -------------------------------------------------------------------------- */

/**
 * Whether the Customer may approve this stage right now.
 *
 * `AWAITING_REVIEW` only. `m2_stage_approve` answers `409
 * m2_stage_transition_not_allowed` when nothing has been submitted and `409
 * m2_stage_disputed` while a dispute is open, and both are refusals a screen can
 * avoid offering rather than collect.
 */
export function canApproveStage(stage: EngagementStage): boolean {
  return stage.status === "AWAITING_REVIEW";
}

/**
 * Whether the Customer may send this stage back for correction.
 *
 * Same window as approval. **A correction is not an amendment**: it asks for the
 * *agreed* work to be done properly and moves no money. A Customer who wants
 * something different is asking for a change order, which needs the vendor's
 * agreement — the server says so with `m2_amendment_required`.
 */
export function canRequestCorrection(stage: EngagementStage): boolean {
  return stage.status === "AWAITING_REVIEW";
}

/**
 * Whether the Customer may dispute this stage.
 *
 * `AWAITING_REVIEW` only, and it is the action that stops the auto-approval
 * clock. A stage already `DISPUTED` is not disputed twice.
 */
export function canDisputeStage(stage: EngagementStage): boolean {
  return stage.status === "AWAITING_REVIEW";
}

/** Evidence exists to look at. An empty array is a real state, not a failure. */
export function hasEvidence(stage: EngagementStage): boolean {
  return stage.evidence.length > 0;
}

/**
 * Whether one piece of evidence is safe to open.
 *
 * `processing_status` is the scan pipeline's answer and `VERIFIED` is the only
 * value that means yes. `PENDING` means the checksum matched and the safety
 * question has not been answered yet — two different questions, deliberately —
 * and anything unrecognised fails **closed**.
 */
export function isEvidenceReadable(evidence: StageEvidence): boolean {
  return evidence.processing_status === "VERIFIED";
}

/* --------------------------------------------------------------------------
   The engagement, as a whole
   -------------------------------------------------------------------------- */

/** A dispute is open somewhere. The engagement carries on; one allocation does not. */
export function isEngagementDisputed(engagement: Engagement): boolean {
  return engagement.status === "DISPUTED" || disputedStages(engagement).length > 0;
}

/**
 * Whether the Customer's final acceptance is what is being waited on.
 *
 * `COMPLETING` is the server's own conclusion that every stage is released. This
 * is the separate fact that the Customer agrees it is done, and accepting closes
 * the requirement as `CLOSED_COMPLETE`.
 */
export function canAcceptCompletion(engagement: Engagement): boolean {
  return engagement.status === "COMPLETING";
}

/** Terminal states: nothing on this engagement is waiting for anybody. */
export function isEngagementFinished(engagement: Engagement): boolean {
  return (
    engagement.status === "COMPLETED" ||
    engagement.status === "CLOSED" ||
    engagement.status === "CANCELLED"
  );
}

/**
 * The single next thing the Customer has to do, in the order money is at stake.
 *
 * `M2-FE-509` and `M2-FE-608` both ask for a "next action" on a list row, and a
 * row that names two of them names none. The order is not arbitrary:
 *
 * 1. **`review_stage`** — a clock may be running against them and approval moves
 *    money. Everything else can wait a day; this cannot.
 * 2. **`accept_completion`** — the work is done and the record is open.
 * 3. **`fund_stage`** — the vendor is waiting to start.
 * 4. **`awaiting_case`** — a dispute is with Operations. The honest next action
 *    is none, and saying "wait" is different from saying "nothing".
 * 5. **`awaiting_vendor`** — it is the vendor's move.
 * 6. **`none`** — finished, cancelled, or a mode this build cannot describe.
 */
export type CustomerNextAction =
  | "review_stage"
  | "accept_completion"
  | "fund_stage"
  | "awaiting_case"
  | "awaiting_vendor"
  | "none";

export function nextCustomerAction(engagement: Engagement): CustomerNextAction {
  if (!isKnownCommercialMode(engagement)) return "none";
  if (isEngagementFinished(engagement)) return "none";
  if (stageAwaitingReview(engagement) !== null) return "review_stage";
  if (canAcceptCompletion(engagement)) return "accept_completion";
  if (nextFundableStage(engagement) !== null) return "fund_stage";
  if (disputedStages(engagement).length > 0) return "awaiting_case";
  return "awaiting_vendor";
}

/* --------------------------------------------------------------------------
   Amendments
   -------------------------------------------------------------------------- */

/**
 * Whether an amendment is still the Customer's to decide.
 *
 * `EngagementAmendment.status` is a **plain string on the wire**, not the
 * published `ScopeAmendmentStatusEnum`, so this compares against the one value
 * that permits a decision and treats everything else — including a value this
 * build has never seen — as not actionable. Failing closed here is the whole
 * point: the failure mode this screen exists to prevent is a proposed amendment
 * reading as agreed scope, and an unrecognised status that fell through to
 * "decidable" would be one keystroke from exactly that.
 *
 * Expiry is *not* checked locally. `expires_at` is presentation; the server
 * decides, and `m2_amendment_not_actionable` is how it says so.
 */
export function isAmendmentDecidable(amendment: EngagementAmendment): boolean {
  return amendment.status === "PROPOSED" && amendment.responded_at === null;
}

/** The amendment has been applied to the agreement and the money has moved. */
export function isAmendmentApplied(amendment: EngagementAmendment): boolean {
  return amendment.applied_at !== null;
}

/**
 * A charge is in flight on this amendment, so nothing has changed yet.
 *
 * `PAYMENT_PENDING` is the managed positive delta between acceptance and the
 * verified provider callback. **Scope does not move until that callback lands**,
 * and this is the state a screen must render as waiting rather than as agreed.
 */
export function isAmendmentAwaitingPayment(amendment: EngagementAmendment): boolean {
  return amendment.status === "PAYMENT_PENDING";
}

/**
 * Whether this build recognises the status at all.
 *
 * Same fail-closed rule as `isKnownCommercialMode`, for the same reason: an
 * unknown status must render as "we cannot describe this" rather than as the
 * nearest-looking one.
 */
const KNOWN_AMENDMENT_STATUSES: readonly string[] = [
  "PROPOSED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_DECLINED",
  "PAYMENT_PENDING",
  "AUTHORIZED",
  "EXPIRED",
];

export function isKnownAmendmentStatus(amendment: EngagementAmendment): boolean {
  return KNOWN_AMENDMENT_STATUSES.includes(amendment.status);
}

/** `TIME_EXTENSION` on A3, `CHANGE_ORDER` on A5. Anything else is undescribable. */
export function isKnownAmendmentKind(amendment: EngagementAmendment): boolean {
  return amendment.kind === "TIME_EXTENSION" || amendment.kind === "CHANGE_ORDER";
}

/**
 * Which way the money goes if this is accepted.
 *
 * `delta_paise` is signed and so is every line: negative removes scope. The
 * three answers are three different sentences and three different screens —
 * a charge to authorise, a refund to expect, and a change that costs nothing.
 */
export type AmendmentDirection = "charge" | "refund" | "no_money";

export function amendmentDirection(amendment: EngagementAmendment): AmendmentDirection {
  if (amendment.delta_paise > 0) return "charge";
  if (amendment.delta_paise < 0) return "refund";
  return "no_money";
}

/**
 * Whether the accepted amendment is waiting on a payment before it applies.
 *
 * The whole of the acceptance contract, in one field. `checkout` is `null` on a
 * `LEAD_ONLY` extension (no platform money exists to move, so it authorises
 * immediately) and on a managed reduction (the refund is issued **before** the
 * scope shrinks, so there is no instant in which the Customer owns less work
 * than they have paid for). A `PaymentAttempt` means **nothing has changed yet**.
 *
 * Repeating the acceptance while that payment is pending returns the same
 * attempt rather than starting a second charge — which is why the screen may
 * offer no second control while it is in flight.
 */
export function amendmentNeedsPayment(decision: EngagementAmendmentDecision): boolean {
  return decision.checkout !== null;
}

/**
 * Whether polling the amendment list can still learn anything.
 *
 * Only while a charge is unresolved. Amendments otherwise move when a person
 * proposes or decides one, which is not a thing to sit on a timer for.
 */
export function isAmendmentListSettled(list: EngagementAmendmentList): boolean {
  return !list.amendments.some(isAmendmentAwaitingPayment);
}

/** Newest first — an amendment history reads backwards from what is live now. */
export function amendmentsNewestFirst(
  list: EngagementAmendmentList,
): readonly EngagementAmendment[] {
  return [...list.amendments].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );
}

/**
 * The amendments that actually changed the agreement, oldest first.
 *
 * `M2-FE-613` asks for the original and amended versions in a readable history,
 * and this is what "a version" is: an amendment the server stamped `applied_at`
 * on. A proposed one is not a version of the agreement — it is a request — and
 * putting it in the same list is precisely the failure this wave is written to
 * prevent.
 */
export function appliedAmendments(
  list: EngagementAmendmentList,
): readonly EngagementAmendment[] {
  return [...list.amendments]
    .filter(isAmendmentApplied)
    .sort((left, right) => Date.parse(left.applied_at!) - Date.parse(right.applied_at!));
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

/** Oldest first. A record is read forwards; wire order is not a promise. */
export function eventsOldestFirst(list: EngagementEventList): readonly EngagementEvent[] {
  return [...list.events].sort(
    (left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at),
  );
}

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

function hasCode(error: unknown, code: string): boolean {
  return error instanceof ApiRequestError && error.code === code;
}

/**
 * `409 m2_stage_not_funded` — the stage cannot be funded right now.
 *
 * Three different facts behind one code: already funded, an earlier stage is
 * not, or the engagement is `LEAD_ONLY` and paid directly to the vendor. None is
 * fixed by retrying, and all three are fixed by re-reading the engagement — so
 * the screen refetches and states what it found rather than offering "Try
 * again".
 */
export function isStageNotFundable(error: unknown): boolean {
  return hasCode(error, "m2_stage_not_funded");
}

/**
 * `409 m2_stage_disputed` — a disputed stage does not move on a clock or on an
 * approval.
 *
 * Reachable on approval and enforced twice on the server on purpose, because a
 * Customer can dispute in the window between the auto-approval sweep reading a
 * list and the task acting on one entry. Arriving here means the screen was
 * looking at a stage that has since been disputed; the honest recovery is to
 * re-read, not to try the same button again.
 */
export function isStageDisputed(error: unknown): boolean {
  return hasCode(error, "m2_stage_disputed");
}

/**
 * `409 m2_stage_transition_not_allowed` — the stage is not in a status this
 * command can move it from.
 *
 * Distinct from `m2_requirement_transition_not_allowed`, and the distinction is
 * not pedantry: a Customer reading "this request cannot do that" about a
 * shift-day has been told about the wrong object entirely.
 */
export function isStageTransitionNotAllowed(error: unknown): boolean {
  return hasCode(error, "m2_stage_transition_not_allowed");
}

/**
 * `409 m2_amendment_not_actionable` — expired, already decided, or one is
 * already open.
 *
 * The opposite claim to `m2_amendment_required`, which is why it is its own
 * code. Recovery is a re-read: whatever the screen was showing is out of date.
 */
export function isAmendmentNotActionable(error: unknown): boolean {
  return hasCode(error, "m2_amendment_not_actionable");
}

/** `409 m2_amendment_required` — this change needs an accepted amendment first. */
export function isAmendmentRequired(error: unknown): boolean {
  return hasCode(error, "m2_amendment_required");
}

/**
 * `404` on an engagement or stage read.
 *
 * Object-level authorization answers `404` rather than `403` wherever existence
 * is private, so this is "gone, or never yours" and neither becomes true on a
 * second attempt.
 */
export function isEngagementNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
