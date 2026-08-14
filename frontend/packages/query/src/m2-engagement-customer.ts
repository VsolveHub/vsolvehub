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
 * ## The second field, added at 1.26.0
 *
 * `EngagementStage.kind`. `WORK` and `MATERIAL_ADVANCE` share one spine and one
 * table, and differ in what the money is *for*: a material advance buys goods,
 * so it is spent rather than earned and is not recovered like an unearned work
 * stage. See `stageKind` below — a screen must read it before it describes what
 * funding or approving a row does.
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
export type EngagementStageKind = Schemas["EngagementStageKindEnum"];
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

/* The A3 shift-day, contract 1.30.0 — see the section at the foot of this file. */
export type ShiftDay = Schemas["ShiftDay"];
export type ShiftAttendance = Schemas["ShiftAttendance"];
export type ShiftAttendanceStatus = Schemas["ShiftAttendanceStatusEnum"];
export type ShiftCrewMember = Schemas["StageCrewMember"];
export type DaySettlement = Schemas["DaySettlement"];
export type DaySettlementStatus = Schemas["DaySettlementStatusEnum"];
export type AttendanceResponse = Schemas["AttendanceResponseEnum"];
export type ShortfallChoice = Schemas["ShortfallChoiceEnum"];
export type DisputedWorker = Schemas["DisputedWorkerRequest"];
export type CashDemandReport = Schemas["CashDemandReport"];

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
   Stage kind — the second field a screen must read before it promises anything
   -------------------------------------------------------------------------- */

/**
 * What a stage row's money is **for**, published at contract 1.26.0.
 *
 * There is one money spine and one stage table, which is correct — a second
 * table for materials would be the duplication this plan forbids. What `kind`
 * buys is the sentence a screen is allowed to say, and the three places the two
 * rows genuinely differ (`M2-BE-543`, `GAP-028`):
 *
 * - a `MATERIAL_ADVANCE` funds through `PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE`
 *   rather than `M2_STAGE_FUNDING`;
 * - it is laid out **after** every work milestone, because funding runs in
 *   position order and a project whose first collection is a materials advance
 *   is the prepay-then-vanish shape staged funding exists to prevent;
 * - **it is not clawed back as unearned work.**
 *   `route_suspended_capability_engagements` refunds a funded, unstarted *work*
 *   stage and refuses to recover a funded material advance, because the vendor
 *   has already bought the goods.
 *
 * That third one is the reason this reaches the UI at all. *Material money is
 * spent, not earned*, so what a Customer is agreeing to when they fund one is
 * materially different from what they agree to when they fund a milestone — and
 * a screen that renders it as an ordinary fundable work stage is asking for
 * consent to the wrong thing.
 *
 * `kind` is immutable after creation, enforced in `save()`, so a row never
 * changes which recovery rule it lives under.
 */
export type StageKind = "work" | "material_advance" | "unknown";

/**
 * Which kind this build can describe.
 *
 * Fail-closed, the same rule as `isKnownCommercialMode` and for the same reason:
 * the optimistic fallback for a third kind is "ordinary work milestone", which
 * is exactly the reading `EngagementStage.kind` was published to prevent. An
 * unrecognised kind renders as "we cannot describe what this money is for"
 * rather than as the nearest-looking thing.
 */
export function stageKind(stage: EngagementStage): StageKind {
  if (stage.kind === "WORK") return "work";
  if (stage.kind === "MATERIAL_ADVANCE") return "material_advance";
  return "unknown";
}

/** Money for goods the vendor buys, not for work somebody performs. */
export function isMaterialAdvance(stage: EngagementStage): boolean {
  return stageKind(stage) === "material_advance";
}

/* --------------------------------------------------------------------------
   Stages: order, funding and the review clock
   -------------------------------------------------------------------------- */

/** The stages in the order the agreement lays them out. Never wire order. */
export function orderedStages(engagement: Engagement): readonly EngagementStage[] {
  return [...engagement.stages].sort((left, right) => left.position - right.position);
}

/**
 * Nobody owes work on this row any more — contract 1.31.0 (`M2-BE-545`).
 *
 * Two paths reach it and neither is a failure of the agreement: a project
 * **terminated early**, and a **material advance left with the outgoing vendor**
 * when a project transfers to a replacement.
 *
 * It is its own predicate rather than another `status === "..."` scattered
 * through this file because three separate helpers below decide "is this stage
 * still outstanding?" **by exclusion** — anything that is not `APPROVED` or
 * `RELEASED` — and a status added to the enum lands in all three as *outstanding*
 * by default. That default was right for every value this file was written
 * against and is wrong for this one.
 *
 * **The money is deliberately not part of this question.** `_cancel_stage`
 * leaves `amount_paise`, `funded_paise` and `refunded_amount_paise` untouched,
 * because the agreement *was* that big and the money *was* collected; a
 * terminated work stage has its unearned funding returned and a cancelled
 * material advance does not. So this answers only what it says: no work is owed.
 */
export function isStageCancelled(stage: EngagementStage): boolean {
  return stage.status === "CANCELLED";
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
 *
 * **A `CANCELLED` stage is skipped, and that guard is load-bearing.**
 * `_cancel_stage` leaves `funding_state` exactly as it found it — the whole
 * point of that method is that the money record is *not* rewritten to make a
 * terminated project look tidy — so a cancelled milestone can sit at `REQUIRED`
 * forever. Without this line the Customer would be offered a pay button for work
 * nobody owes any more, which is the worst button on this surface.
 */
export function nextFundableStage(engagement: Engagement): EngagementStage | null {
  if (!isManagedPayment(engagement)) return null;
  for (const stage of orderedStages(engagement)) {
    if (isStageCancelled(stage)) continue;
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
 * has nothing left to do and the vendor has nothing left to submit — **or
 * `CANCELLED`, which is nobody's move at all.** A cancelled row was reported as
 * the active stage until 1.31.0 widened the enum, which would have put "Now:
 * Second fix" at the top of a project whose second fix had been terminated.
 */
export function activeStage(engagement: Engagement): EngagementStage | null {
  return (
    orderedStages(engagement).find(
      (stage) =>
        !isStageCancelled(stage) && stage.status !== "APPROVED" && stage.status !== "RELEASED",
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
 *
 * **Cancelled stages leave the denominator entirely** (1.31.0). They are not
 * done, so counting them as done would overstate the work; they are not
 * outstanding either, so leaving them in the total means a terminated or
 * transferred project reads "3 of 5" for ever and never finishes. Neither is
 * true, and the honest bar counts only the rows somebody still owes.
 */
export function stageProgress(engagement: Engagement): { done: number; total: number } {
  const live = engagement.stages.filter((stage) => !isStageCancelled(stage));
  const done = live.filter(
    (stage) => stage.status === "APPROVED" || stage.status === "RELEASED",
  ).length;
  return { done, total: live.length };
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

/* --------------------------------------------------------------------------
   The A3 shift-day — `M2-FE-510`, `514`, `515`, contract 1.30.0
   -------------------------------------------------------------------------- */

/**
 * One shift-day, as the Customer is entitled to see it.
 *
 * ## Why this is one read and not three
 *
 * `GET /engagement-stages/{id}/shift/` answers the crew, the supervisor's
 * attendance and the evening settlement together, on the server's own reasoning:
 * they are the same screen at three moments of one evening, and separate reads
 * would let them disagree about which day the Customer is looking at. "4 of 4
 * present" beside an unpaid settlement is precisely the disagreement that
 * matters here.
 *
 * ## Nothing below computes money, and one function exists to say so
 *
 * `settlementAmountPaise` returns the server's `amount_paise` and never
 * `per_worker_paise × workers_present`. The two agree today by a **database
 * check constraint** (`requirements_day_settlement_reconciles`), which is
 * exactly why re-deriving it here would be worthless: a client that computes
 * "3 of 4" is a client that can hand a worker the wrong wage the day the
 * constraint gains an extras term this build has never heard of. Same rule for
 * the UPI deep link — it is read, never assembled.
 *
 * ## The platform never holds this money
 *
 * A3 wages are direct, daily and peer-to-peer. There is no checkout on
 * `DaySettlement`, no payment attempt, no refund and no payout, and no endpoint
 * in this contract can move a wage. The tap is a **record that both sides
 * agree**, not a payment rail, and every screen built on these helpers has to
 * say so.
 */

/* -- Attendance ----------------------------------------------------------- */

/**
 * Whose move it is on today's count.
 *
 * Six states, because collapsing any two of them puts a button in front of
 * somebody the server will refuse:
 *
 * - **`not_started`** — nothing has touched the day. `attendance` is `null` on
 *   the wire and that is a real state: reading a shift-day creates nothing.
 * - **`awaiting_arrival`** — a crew is named but nobody has confirmed they
 *   turned up, so there is no count to answer.
 * - **`awaiting_supervisor`** — arrival is stamped and the supervisor has not
 *   recorded `n of m` yet. `respond_attendance` answers `409` here.
 * - **`awaiting_you`** — the one state in which the Customer decides.
 * - **`you_confirmed`** / **`you_disputed`** — answered. The server returns the
 *   existing record rather than answering twice.
 *
 * An unrecognised status falls to `undescribable` rather than to `awaiting_you`:
 * the optimistic reading is the one that offers a money decision on a state this
 * build has never seen.
 */
export type AttendancePhase =
  | "not_started"
  | "awaiting_arrival"
  | "awaiting_supervisor"
  | "awaiting_you"
  | "you_confirmed"
  | "you_disputed"
  | "undescribable";

export function attendancePhase(day: ShiftDay): AttendancePhase {
  const attendance = day.attendance;
  if (attendance === null) return "not_started";
  switch (attendance.status) {
    case "PENDING":
      return attendance.arrival_confirmed_at === null
        ? "awaiting_arrival"
        : "awaiting_supervisor";
    case "SUPERVISOR_CONFIRMED":
      return "awaiting_you";
    case "CUSTOMER_CONFIRMED":
      return "you_confirmed";
    case "DISPUTED":
      return "you_disputed";
    default:
      return "undescribable";
  }
}

/** The one state in which the Customer may confirm or dispute the day. */
export function canRespondToAttendance(day: ShiftDay): boolean {
  return attendancePhase(day) === "awaiting_you";
}

/**
 * How many of the booked workers did not come, from the server's own field.
 *
 * `shortfall_count` is published; `expected_count - present_count` is not
 * subtracted here. Zero is the ordinary answer and is not the same fact as
 * `present_count === null`, which is "nobody has said yet" — that is what
 * `attendancePhase` is for.
 */
export function attendanceShortfall(day: ShiftDay): number {
  return day.attendance?.shortfall_count ?? 0;
}

/**
 * Whether answering this day requires the Customer to choose what happens to
 * the missing worker-days.
 *
 * `respond_attendance` refuses a `CONFIRM` on a shortfall with no
 * `shortfall_choice` (`409 m2_stage_transition_not_allowed`), so a screen that
 * offered a bare confirm here would be offering a refusal. The choice decides
 * what happens to the **missing** worker-days and never to the money for the
 * ones who came — the day settles at the present workers' published rate
 * whichever is chosen.
 */
export function requiresShortfallChoice(day: ShiftDay): boolean {
  return canRespondToAttendance(day) && attendanceShortfall(day) > 0;
}

/** The three choices C4 implements, in the order the screen offers them. */
export const SHORTFALL_CHOICES: readonly ShortfallChoice[] = [
  "CONTINUE_SHORT",
  "ADD_DAY",
  "CANCEL_SHORTFALL",
];

/**
 * The server's cap on a dispute's per-worker lines (`MAXIMUM_DISPUTED_WORKERS`).
 *
 * Duplicated from the domain constant deliberately and kept as a *guard rail
 * only*: the screen never adds a line past it, and the server still refuses one
 * that arrives. It is not a business rule this client owns.
 */
export const MAXIMUM_DISPUTED_WORKERS = 40;

/**
 * Whether a dispute says anything a case could act on.
 *
 * The server accepts a blank dispute and substitutes its own sentence, which is
 * correct of a *server* and wrong of a *screen*: "the customer disputed the
 * attendance count" tells Operations nothing they did not already know from the
 * status. So one of the two has to carry content — a named worker or a note.
 *
 * This is the **only** place per-worker detail is ever collected. C4 has no
 * per-worker check-in and no per-worker check-out on purpose, and a routine
 * Customer form asking who was there would be inventing data the server does not
 * hold.
 */
export function canSubmitAttendanceDispute(
  workers: readonly DisputedWorker[],
  note: string,
): boolean {
  if (workers.length > MAXIMUM_DISPUTED_WORKERS) return false;
  return note.trim() !== "" || workers.some((worker) => worker.name.trim() !== "");
}

/* -- The evening settlement ----------------------------------------------- */

/**
 * Where the dual "Day settled?" tap has got to.
 *
 * The middle two states are the point of the whole mechanism. A one-sided claim
 * is left standing rather than treated as the fact, because "one person says
 * they settled and the other has not answered" is a different sentence from
 * either "they were paid" or "they were not" — and it is the sentence Operations
 * reads as **unproven**. Only both taps make `SETTLED`, and the amount freezes
 * there.
 */
export type SettlementPhase =
  | "not_ready"
  | "nobody_yet"
  | "you_said_settled"
  | "they_said_settled"
  | "both_agreed"
  | "undescribable";

export function settlementPhase(day: ShiftDay): SettlementPhase {
  const settlement = day.settlement;
  // Null is not "unsettled": it is "no amount exists yet", because the row is
  // created by the first command that touches the day rather than by a read.
  if (settlement === null) return "not_ready";
  switch (settlement.status) {
    case "AWAITING_BOTH":
      return "nobody_yet";
    case "CUSTOMER_CLAIMED":
      return "you_said_settled";
    case "SUPERVISOR_CLAIMED":
      return "they_said_settled";
    case "SETTLED":
      return "both_agreed";
    default:
      return "undescribable";
  }
}

/**
 * Whether the Customer's half of the dual tap is still to come.
 *
 * Gated on the **count**, not on the settlement row: `confirm_day_settled`
 * refuses with `409 m2_stage_transition_not_allowed` until somebody has said who
 * was there, and it creates the settlement itself when it runs. So a day with a
 * recorded count and no settlement row is tappable, and a day with no count is
 * not — whatever the row says.
 */
export function canConfirmDaySettled(day: ShiftDay): boolean {
  if (day.attendance === null || day.attendance.present_count === null) return false;
  if (settlementPhase(day) === "undescribable") return false;
  return day.settlement === null || day.settlement.customer_confirmed_at === null;
}

/** This Customer has already tapped. The record says so; nothing is inferred. */
export function hasCustomerConfirmedSettlement(day: ShiftDay): boolean {
  return day.settlement !== null && day.settlement.customer_confirmed_at !== null;
}

/** A one-sided claim, which is what Operations reads as unproven. */
export function isSettlementUnproven(day: ShiftDay): boolean {
  const phase = settlementPhase(day);
  return phase === "you_said_settled" || phase === "they_said_settled";
}

/**
 * The exact published amount for this day, in integer paise, or null.
 *
 * **This is the one home.** Session B wrote a byte-equivalent twin of this
 * function and of `settlementPaymentLink` in `m2-engagement-partner.ts` in the
 * same wave, and two exports of one name is a `tsc` failure rather than a style
 * question. Folded here at the Gate 3 integration, on the barrel's own rule:
 * everything both parties read the same way is exported from
 * `m2-engagement-customer` and deliberately not re-exported in the partner
 * block. The vendor's settlement panel imports it from `@vsolve/query` and
 * needed no change.
 *
 * **Read, never computed.** `amount_paise` is `per_worker_paise × workers_present
 * + extras_paise` by a database check constraint, and re-deriving it here would
 * buy nothing and cost the one thing that matters: a client that does its own
 * arithmetic keeps paying the old formula through a change to the real one.
 *
 * Null means no count has been recorded, so there is no amount — not zero. Zero
 * is a day nobody came to, which is a different fact and a different screen.
 */
export function settlementAmountPaise(day: ShiftDay): number | null {
  return day.settlement?.amount_paise ?? null;
}

/**
 * The UPI deep link at that amount, or null — a **convenience, not a rail**.
 *
 * Returned verbatim. Nothing in this client assembles a `upi://pay` string: the
 * payee, the amount and the note are the server's, because a link a client built
 * is a link a client can build wrong, and the failure mode is money reaching the
 * wrong VPA.
 *
 * **Null now means exactly one thing: the lead has published no VPA** — an
 * ordinary state and not an error. Until 1.31.0 it meant that *or* that the read
 * did not carry the link at all, because `DaySettlementSerializer` declared
 * `upi_payment_link` as an `allow_null` field over a model attribute that did
 * not exist and only the *command* response ever populated it. That was this
 * column's §7 gap and the backend closed it with a `SerializerMethodField`; the
 * link survives a reload and the call site's compensating fallback is deleted.
 *
 * The screen still shows the amount and still does not claim the professional
 * has no UPI address. That copy was written to survive an ambiguity that has
 * since gone, and it stays because it was never really about the ambiguity: what
 * somebody owes is the fact, and the link is a shortcut to paying it.
 */
export function settlementPaymentLink(day: ShiftDay): string | null {
  return day.settlement?.upi_payment_link ?? null;
}

/* -- Cash demands --------------------------------------------------------- */

/**
 * Whether to offer the "they asked for extra in cash" report.
 *
 * `LEAD_ONLY` only, and that is not squeamishness about A5: the report's whole
 * consequence is a standing event against the lead and, past an owner-set
 * threshold, suspension of their **A3 capability**. On a managed project the
 * same complaint is a scope argument the amendment engine and the dispute path
 * already answer.
 *
 * Deliberately **not** gated on the engagement being live. A Customer who was
 * asked for cash on Friday reports it on Saturday, and a control that needed an
 * open shift-day to attach to would be one nobody could reach the next morning.
 */
export function canReportCashDemand(engagement: Engagement): boolean {
  return isLeadOnly(engagement);
}

/**
 * `409 m2_stage_transition_not_allowed` on a shift-day read.
 *
 * The read raises it on an **A5 milestone** — a project stage has no crew, no
 * attendance and no daily settlement — which is a screen that should not have
 * mounted rather than an error to show a Customer. Distinguished here so the
 * call site can render nothing instead of a refusal.
 */
export function isNotAShiftDay(error: unknown): boolean {
  return hasCode(error, "m2_stage_transition_not_allowed");
}
