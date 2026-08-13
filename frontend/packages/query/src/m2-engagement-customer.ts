/**
 * The Customer's half of the engagement spine — contract 1.24.0.
 *
 * One `Engagement` and its ordered `EngagementStage`s, read through the
 * Customer's own route. A3 and A5 run on the same spine (ADR-0007), so there is
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
 */

import { ApiRequestError } from "@vsolve/api-client";
import type { Schemas } from "@vsolve/api-client";

export type Engagement = Schemas["Engagement"];
export type EngagementStage = Schemas["EngagementStage"];
export type EngagementStatus = Schemas["EngagementStatusEnum"];
export type EngagementStageStatus = Schemas["EngagementStageStatusEnum"];
export type EngagementStageFundingState = Schemas["EngagementStageFundingStateEnum"];
export type EngagementCommercialMode = Schemas["EngagementCommercialModeEnum"];

/* --------------------------------------------------------------------------
   Commercial mode
   -------------------------------------------------------------------------- */

/**
 * A3: the Customer pays the vendor directly and Vsolve holds no service money.
 *
 * `M2-FE-415` turns on this and nothing else. Every claim the connection screen
 * makes — who is paid, who refunds, who carries the warranty — is decided here,
 * and the honest sentence is that service payment, service refunds and warranty
 * are between the Customer and the vendor.
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
   Stages and funding
   -------------------------------------------------------------------------- */

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
  const ordered = [...engagement.stages].sort((left, right) => left.position - right.position);
  for (const stage of ordered) {
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
 * What the Customer has actually funded so far, in paise.
 *
 * Summed from `FUNDED` stages only. This is the one number on the screen that is
 * derived rather than published, and it is derived from server-stamped states
 * rather than from anything the client decided — `M2-FE-608` needs "funded
 * amount" and no field carries it. Requested in `frontend-execution-plan.md` §7;
 * until it lands, this is arithmetic over the server's own answers, which is the
 * most a client may do.
 */
export function fundedTotalPaise(engagement: Engagement): number {
  return engagement.stages
    .filter((stage) => stage.funding_state === "FUNDED")
    .reduce((total, stage) => total + stage.amount_paise, 0);
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
  return error instanceof ApiRequestError && error.code === "m2_stage_not_funded";
}

/**
 * `404` on the engagement read.
 *
 * Object-level authorization answers `404` rather than `403` wherever existence
 * is private, so this is "gone, or never yours" and neither becomes true on a
 * second attempt.
 */
export function isEngagementNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
