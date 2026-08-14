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

/* The A5 project, contract 1.31.0 — see the section at the foot of this file. */
export type ProjectPlan = Schemas["ProjectPlan"];
export type ProjectMilestone = Schemas["ProjectMilestone"];
export type ProjectHandover = Schemas["ProjectHandover"];
export type ProjectDeliverable = Schemas["ProjectDeliverable"];
export type ProjectDeliverableKind = Schemas["ProjectDeliverableKindEnum"];
export type ProjectTransfer = Schemas["ProjectTransfer"];
export type ProjectTransferStatus = Schemas["ProjectTransferStatusEnum"];
export type ProjectDelayClaim = Schemas["ProjectDelayClaim"];
export type ProjectDelayClaimStatus = Schemas["ProjectDelayClaimStatusEnum"];

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
function kindFromWire(kind: string): StageKind {
  if (kind === "WORK") return "work";
  if (kind === "MATERIAL_ADVANCE") return "material_advance";
  return "unknown";
}

export function stageKind(stage: EngagementStage): StageKind {
  return kindFromWire(stage.kind);
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

/* --------------------------------------------------------------------------
   The A5 project — `M2-FE-611`, `612`, contract 1.31.0
   -------------------------------------------------------------------------- */

/**
 * One A5 project, as the Customer is entitled to see it.
 *
 * ## Why this is one read and not four
 *
 * `GET /engagements/{id}/project/` answers the milestones, the money, the
 * warranty retention, the handover and whatever recovery is in flight together.
 * The server's own reasoning is the reason there is one query key at the call
 * site rather than four: they are one project at five moments, and a client
 * assembling them from separate reads renders four of them against a state the
 * fifth has already left. A transfer proposal beside a milestone list it was not
 * priced against is precisely the disagreement that matters here — the server
 * refuses that acceptance, and the screen would have collected it.
 *
 * ## Three things this section refuses to compute
 *
 * **The retention.** `retention_paise` is where the hold-back is going and
 * `retention_withheld_paise` is what has actually been held so far; both are
 * published, and the second climbs as milestones are approved rather than
 * appearing whole at the end. Nothing here multiplies a percentage by anything.
 *
 * **The transfer delta.** `delta_paise` is held equal to
 * `replacement_remaining_paise - previous_remaining_paise` by a database
 * constraint, so a client may render it without checking the arithmetic — and
 * must not re-derive it, because a client that computes a money difference is a
 * client that can show a Customer a number their statement disagrees with.
 *
 * **What a transfer will refund.** `refunded_paise` is what *actually* went back
 * and it is zero on a proposal, because nothing has moved yet. The unearned
 * funding a transfer would return is `funded - refunded - released` per
 * transferable milestone, and that subtraction is deliberately absent from this
 * file: a predicted refund rendered as a number is a promise, and this one is
 * conditional on a state the Customer has not accepted yet. The rule is stated
 * in words on the screen instead.
 *
 * ## And one it refuses to describe
 *
 * `material_advance_outstanding_paise` is money the Customer already paid the
 * abandoning vendor for goods. A transfer does **not** recover it and does not
 * hand it to the replacement; **no command in this system will ever refund it.**
 * It renders as an open question for support and never as a pending refund.
 */

/**
 * The one cancellation reason a screen must read rather than infer.
 *
 * A cancelled milestone carrying this code is a **funded material advance left
 * with the outgoing vendor** — that money bought goods and nothing is coming
 * back. Every other cancellation on a project is a work milestone taken out of
 * the agreement by an early termination, whose unearned funding *is* returned.
 *
 * One sentence cannot be true of both, which is why this is a published string
 * rather than something derived from `kind`: a *cancelled but unfunded*
 * material advance is not left with anybody, and calling that one unrefundable
 * would be inventing a loss.
 */
export const MATERIAL_ADVANCE_LEFT_WITH_VENDOR = "material_advance_left_with_vendor";

/** The milestones in the order the project lays them out. Never wire order. */
export function milestonesInOrder(plan: ProjectPlan): readonly ProjectMilestone[] {
  return [...plan.milestones].sort((left, right) => left.position - right.position);
}

/**
 * What a milestone's money is for, on the project read's own shape.
 *
 * The same fail-closed three-way answer `stageKind` gives on the engagement
 * read, against the same published enum. Separate because the two wires are
 * separate shapes — `ProjectMilestone` is not a `ModelSerializer` over
 * `EngagementStage` — and a structural helper over `{kind}` would silently
 * accept any object that happened to carry the field.
 */
export function milestoneKind(milestone: ProjectMilestone): StageKind {
  return kindFromWire(milestone.kind);
}

/** Nobody owes work on this milestone any more. See `isStageCancelled`. */
export function isMilestoneCancelled(milestone: ProjectMilestone): boolean {
  return milestone.status === "CANCELLED";
}

/**
 * Money that is gone: a funded material advance the transfer left behind.
 *
 * **Both halves are required.** The `kind` alone is not enough — an *unfunded*
 * material advance cancelled by an early termination cost the Customer nothing —
 * and the reason code alone is checked as well so that a code this build has
 * never seen cannot fall into the "not coming back" branch by accident.
 */
export function isMaterialAdvanceLeftWithVendor(milestone: ProjectMilestone): boolean {
  return (
    isMilestoneCancelled(milestone) &&
    milestone.cancellation_reason_code === MATERIAL_ADVANCE_LEFT_WITH_VENDOR
  );
}

/**
 * Whether this milestone carries a usable "as agreed" reading (`M2-BE-549`).
 *
 * `original_terms` is a snapshot written by all three paths that lay a stage
 * out, and it is **empty on a row created before it existed**. The serializer
 * unpacks an empty snapshot as `""`, `0` and `null` rather than omitting the
 * fields — so an unguarded screen renders "originally ₹0", which is not a
 * missing value but a false one, and it appears in exactly the argument the two
 * readings exist for.
 */
export function hasOriginalTerms(milestone: ProjectMilestone): boolean {
  return (
    milestone.original_milestone_label !== "" ||
    milestone.original_deliverable !== "" ||
    milestone.original_amount_paise > 0 ||
    milestone.original_scheduled_on !== null
  );
}

/** The price moved since it was agreed — a transfer reprices, an amendment can too. */
export function milestoneRepriced(milestone: ProjectMilestone): boolean {
  return hasOriginalTerms(milestone) && milestone.amount_paise !== milestone.original_amount_paise;
}

/**
 * How many days this milestone has moved, or null when the question has no answer.
 *
 * Published rather than subtracted here, and that is not tidiness: a date
 * difference computed in a browser is a date difference in whatever timezone the
 * browser is in, and this number is read in disputes about lateness.
 * `schedule_shift_days` is null when either date is missing, and zero is a real
 * answer meaning "on the day we agreed".
 */
export function milestoneScheduleShiftDays(milestone: ProjectMilestone): number | null {
  return milestone.schedule_shift_days;
}

/* -- Completion, and the three things that block it ------------------------ */

/**
 * Whether the vendor still owes work on this stage.
 *
 * **An exhaustive map, not an exclusion.** The tempting spelling is "anything
 * that is not `APPROVED` or `RELEASED`", and 1.31.0 is the wave that proves why
 * it is wrong: `CANCELLED` arrived and would have been absorbed as *still open*
 * by every exclusion in this file, silently, with nothing to fail. Written as a
 * `Record` over the published union, a ninth status is a `tsc` error here rather
 * than a screen that quietly changes meaning — and the runtime fallback is
 * `true`, so a value that reaches an older bundle blocks completion instead of
 * being swept past it.
 *
 * The membership is the server's own `EngagementStage.OPEN_STATUSES`, which
 * `accept_engagement_completion` checks before it closes anything (`M2-BE-548`).
 */
const STAGE_OWES_WORK: Record<EngagementStageStatus, boolean> = {
  PENDING: true,
  IN_PROGRESS: true,
  AWAITING_REVIEW: true,
  CORRECTION_REQUESTED: true,
  DISPUTED: true,
  APPROVED: false,
  RELEASED: false,
  CANCELLED: false,
};

export function stageOwesWork(stage: EngagementStage): boolean {
  return STAGE_OWES_WORK[stage.status] ?? true;
}

/** Every stage somebody still owes work on, in agreement order. */
export function openStages(engagement: Engagement): readonly EngagementStage[] {
  return orderedStages(engagement).filter(stageOwesWork);
}

/**
 * Why the Customer's final acceptance would be refused, or null.
 *
 * `m2_engagement_completion_accept` has three refusals and **none of them
 * approves anything on the way past** (`M2-BE-548`). Two are readable from the
 * engagement itself and are ordered exactly as the server checks them — a
 * disputed stage answers `m2_stage_disputed`, any other open stage answers
 * `m2_stage_transition_not_allowed`. The third, an unaccepted handover, lives on
 * the project read and is `handoverBlocksCompletion` below.
 *
 * This exists so the screen can **explain** rather than offer a button that
 * refuses, and it must never be read the other way round: nothing here approves,
 * skips or sweeps a stage. An accepted amendment can append work *after*
 * `COMPLETING`, and that stage keeps its own review.
 */
export type CompletionBlocker = "open_stage" | "disputed_stage" | null;

export function completionBlocker(engagement: Engagement): CompletionBlocker {
  const open = openStages(engagement);
  if (open.length === 0) return null;
  return open.some((stage) => stage.status === "DISPUTED") ? "disputed_stage" : "open_stage";
}

/* -- Warranty retention (`M2-BE-546`) -------------------------------------- */

/**
 * Where the warranty hold-back has got to.
 *
 * **Retention is payout-side money.** The Customer funds every milestone at
 * **face value**; what retention changes is how much of an approved milestone
 * the vendor may draw before the warranty is over. A screen that describes it as
 * money withheld from the Customer's payments has described the wrong side of
 * the transaction and will be contradicted by the funding controls two sections
 * up.
 *
 * **It is allocated cumulatively, and never "from the final milestone".** The
 * obvious reading — subtract it when approving the last stage — stops being
 * computable the moment an amendment appends one, and a retention already
 * released out of what turned out not to be the last milestone cannot be
 * un-released. So `retention_withheld_paise` climbs against the cumulative
 * approved total and reaches `retention_paise` exactly when the last milestone
 * is approved, whichever milestone that turns out to be. No screen may name a
 * milestone as the one it comes out of.
 *
 * Four phases, switched on the published status rather than inferred from the
 * numbers:
 *
 * - **`none`** — nothing is held. This is the ordinary case and it is **not** a
 *   statement that the work carries no guarantee: warranty terms live on the
 *   estimate the Customer accepted, and a variant with no configured retention
 *   simply funds none of it through Vsolve.
 * - **`accruing`** — a retention is configured and is building up as milestones
 *   are approved. `warranty_ends_at` is still null and no date may be shown.
 * - **`held`** — `WARRANTY`. The work is finished, the hold-back is complete and
 *   `warranty_ends_at` says when it releases.
 * - **`released`** — `CLOSED`, which is reachable only through `WARRANTY` and
 *   means the warranty period is over.
 */
export type RetentionPhase = "none" | "accruing" | "held" | "released";

export function retentionPhase(plan: ProjectPlan): RetentionPhase {
  if (plan.retention_paise <= 0 && plan.retention_withheld_paise <= 0) return "none";
  if (plan.status === "CLOSED") return "released";
  if (plan.status === "WARRANTY") return "held";
  return "accruing";
}

/**
 * The warranty window is running now.
 *
 * Read from `status`, not from `warranty_ends_at`: an engagement with no
 * warranty is terminal at `COMPLETED` and never reaches `CLOSED`, so "has an end
 * date" and "is in its warranty" are different questions with different answers
 * either side of the sweep that closes it.
 */
export function isWarrantyRunning(plan: ProjectPlan): boolean {
  return plan.status === "WARRANTY";
}

/* -- The handover (`M2-BE-547`) -------------------------------------------- */

/**
 * Where the digital handover has got to — two published timestamps, three states.
 *
 * `submitted_at` set with `accepted_at` null is the state in which
 * `m2_engagement_completion_accept` **refuses**, and that refusal is the entire
 * mechanism keeping Event and Media delivery on the platform: a vendor who hands
 * over privately has an engagement that will not close and a retention that will
 * not release. The screen renders it as the Customer's move, because it is.
 */
export type HandoverPhase = "none" | "submitted" | "accepted";

export function handoverPhase(plan: ProjectPlan): HandoverPhase {
  if (plan.handover.accepted_at !== null) return "accepted";
  return plan.handover.submitted_at === null ? "none" : "submitted";
}

/** Something has been handed over and the Customer has not answered it. */
export function canAcceptHandover(plan: ProjectPlan): boolean {
  return handoverPhase(plan) === "submitted";
}

/** The third refusal on `accept_engagement_completion`, which lives on this read. */
export function handoverBlocksCompletion(plan: ProjectPlan): boolean {
  return canAcceptHandover(plan);
}

/**
 * The location a `LINK` deliverable points at, or null.
 *
 * `https` only, checked here as well as on the server, and **not coerced**. A
 * handover link the Customer opens is a link this platform showed them; quietly
 * upgrading or downgrading a scheme on their behalf is not a decision to take in
 * a render function. A `FILE` always answers null — it is a row on the stage
 * evidence rail, and no download route for that rail is published.
 */
export function deliverableLink(deliverable: ProjectDeliverable): string | null {
  if (deliverable.kind !== "LINK") return null;
  const url = deliverable.external_url.trim();
  return url.toLowerCase().startsWith("https://") ? url : null;
}

/* -- The vendor transfer (`M2-BE-545`) ------------------------------------- */

/**
 * Whether this build recognises the transfer's state at all.
 *
 * Fail-closed on the rule this module applies to every other status union: the
 * optimistic fallback here is "a live proposal you can accept", which on a
 * decided or expired transfer is a button that moves somebody's project.
 */
const KNOWN_TRANSFER_STATUSES: readonly string[] = ["PROPOSED", "ACCEPTED", "DECLINED", "EXPIRED"];

export function isKnownTransferStatus(transfer: ProjectTransfer): boolean {
  return KNOWN_TRANSFER_STATUSES.includes(transfer.status);
}

/**
 * Still the Customer's to decide.
 *
 * **Operations proposes and the Customer decides**, and that split is the point:
 * their remaining cost changes, and 07 §7 does not let Operations change
 * somebody's agreement for them. There is no Customer-side initiation to build.
 *
 * Expiry is not checked locally, on `isAmendmentDecidable`'s precedent:
 * `expires_at` is presentation and the server decides, saying so with
 * `m2_amendment_not_actionable`.
 */
export function isTransferDecidable(transfer: ProjectTransfer): boolean {
  return transfer.status === "PROPOSED" && transfer.decided_at === null;
}

/** Accepted and applied — the milestones have been refunded and repriced. */
export function isTransferApplied(transfer: ProjectTransfer): boolean {
  return transfer.status === "ACCEPTED" && transfer.applied_at !== null;
}

/**
 * Which way the remaining cost moves if this is accepted.
 *
 * From the published `delta_paise` and nothing else. `previous_remaining_paise`,
 * `replacement_remaining_paise` and `delta_paise` are held consistent by a
 * database constraint, so subtracting the first two here would be a second
 * implementation of an equation that cannot disagree with itself on the server
 * and can here.
 */
export type TransferDirection = "costs_more" | "costs_less" | "same";

export function transferDirection(transfer: ProjectTransfer): TransferDirection {
  if (transfer.delta_paise > 0) return "costs_more";
  if (transfer.delta_paise < 0) return "costs_less";
  return "same";
}

/**
 * The replacement's price per milestone, or null when it cannot be trusted.
 *
 * `stage_prices` is a `JSONField` and is published as `unknown`, so this is the
 * one place in the Customer's M2 surface that narrows an untyped payload. It
 * matters because **the transfer is priced per milestone and never as a lump**:
 * a replacement who names one number for "the rest of it" has not said which of
 * the agreed milestones they are doing, and a Customer accepting a total against
 * a scope nobody restated is the failure `M2-BE-545` is shaped to prevent. The
 * keys are also the authoritative list of what transfers — better than
 * re-deriving the server's own status filter in a browser.
 *
 * **Fails closed to null on anything unexpected**, including one bad entry,
 * rather than dropping the entry: a per-milestone table missing a row is a
 * shorter list of work than the one being priced, which is exactly the lie the
 * server refuses to let a vendor tell. The call site falls back to the two
 * published totals, which are always safe to render.
 */
export function transferStagePrices(transfer: ProjectTransfer): ReadonlyMap<string, number> | null {
  const raw: unknown = transfer.stage_prices;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prices = new Map<string, number>();
  for (const [stageId, amount] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) return null;
    prices.set(stageId, amount);
  }
  return prices.size === 0 ? null : prices;
}

/** Money already spent on goods that this transfer leaves exactly where it is. */
export function hasOutstandingMaterialAdvance(transfer: ProjectTransfer): boolean {
  return transfer.material_advance_outstanding_paise > 0;
}

/**
 * `409 m2_stage_transition_not_allowed` on the project read.
 *
 * The read raises it on an **A3 engagement** — a workforce booking has
 * shift-days, not milestones — which is a screen that should not have mounted
 * rather than an error to show a Customer. The exact mirror of `isNotAShiftDay`
 * on the other archetype, and named separately so a call site cannot suppress
 * the wrong one: the code is shared and only the surface it arrived on says
 * which object the refusal was about.
 */
export function isNotAProject(error: unknown): boolean {
  return hasCode(error, "m2_stage_transition_not_allowed");
}
