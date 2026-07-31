import type { FulfilmentType } from "../contract-pending/types";

/**
 * The two stage sequences.
 *
 * Doc 10 §2.1 corrected doc 09: Instant and Scheduled are not one shared flow
 * with a branch in the middle. Doc 11 §2 then reversed Instant's ordering to
 * payment-first. What survives both is that the sequences are *different lists*,
 * so they are modelled as different lists here rather than as one list with
 * conditionals — which is what makes "no provider-selection UI is reachable in
 * the Instant flow" checkable instead of reviewable.
 *
 * ## On where the address stage sits
 *
 * Doc 11 §2 numbers address as step 4, after scope and duration. Doc 03 §1
 * ("ask location before requirements"), doc 10 §2.1 ("confirm address and
 * serviceability" first) and tasks.md B3 ("ask location/serviceability early")
 * all put it first.
 *
 * These are reconcilable. Doc 11 §2.1's actual requirement is a gate — a
 * geocoded serviceable address is "required before the quote screen for Instant,
 * not optional, not deferred" — and asking first satisfies that strictly. So
 * address leads both sequences, and the Instant gate is additionally enforced as
 * a guard in `machine.ts`, because ordering the stages correctly is not the same
 * as proving the address survived to the quote.
 */

export const STAGES = [
  "address",
  "type",
  "scope",
  "duration",
  // Scheduled-only
  "slot",
  "provider",
  "hold",
  // Instant-only
  "precheck",
  "assigning",
  // Both
  "review",
  "login",
  "pay",
  "confirmed",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Scheduled: slot, then a chosen or auto-assigned Partner, then a
 * provider-specific hold, then review, then login-resume, then pay.
 *
 * Login sits after review here (doc 03 §6, doc 09 §5): a logged-out customer
 * configures and reviews freely, and only authenticates when the action needs a
 * server cart.
 */
const SCHEDULED_SEQUENCE: readonly Stage[] = [
  "address",
  "type",
  "scope",
  "duration",
  "slot",
  "provider",
  "hold",
  "review",
  "login",
  "pay",
  "confirmed",
] as const;

/**
 * Instant: no provider stage at any point, and login *before* the pre-check.
 *
 * The login position is the inverse of Scheduled's and is deliberate — doc 10
 * §2.2 and doc 11 §2 step 5 both require an account to exist before money is
 * taken, and the pre-check and quote are the last things before the pay action.
 *
 * `hold` is absent as well as `provider`: under doc 11 §2 there is no
 * Partner-specific hold at payment time, and the UI must not imply one exists.
 */
const INSTANT_SEQUENCE: readonly Stage[] = [
  "address",
  "type",
  "scope",
  "duration",
  "login",
  "precheck",
  "review",
  "pay",
  "assigning",
  "confirmed",
] as const;

/** Stages reached before the customer has chosen Instant or Scheduled. */
export const COMMON_PREFIX: readonly Stage[] = ["address", "type"] as const;

/**
 * Stages B3 implements. The rest are modelled so the ordering rules are
 * enforced and testable, and are built by B4 (login), B5 (pay) and B6
 * (assigning, confirmed).
 */
export const STAGES_IMPLEMENTED_BY_B3: readonly Stage[] = [
  "address",
  "type",
  "scope",
  "duration",
  "slot",
  "provider",
  "hold",
  "precheck",
  "review",
] as const;

export function sequenceFor(fulfilment: FulfilmentType): readonly Stage[] {
  return fulfilment === "INSTANT" ? INSTANT_SEQUENCE : SCHEDULED_SEQUENCE;
}

/** True when the stage exists in that sequence at all. */
export function sequenceContains(fulfilment: FulfilmentType, stage: Stage): boolean {
  return sequenceFor(fulfilment).includes(stage);
}

export function stageIndex(fulfilment: FulfilmentType, stage: Stage): number {
  return sequenceFor(fulfilment).indexOf(stage);
}

/** The stage after `stage`, or null at the end of the sequence. */
export function nextStage(fulfilment: FulfilmentType, stage: Stage): Stage | null {
  const sequence = sequenceFor(fulfilment);
  const index = sequence.indexOf(stage);
  if (index === -1 || index === sequence.length - 1) return null;
  return sequence[index + 1] ?? null;
}

/** The stage before `stage`, or null at the start. */
export function previousStage(fulfilment: FulfilmentType, stage: Stage): Stage | null {
  const sequence = sequenceFor(fulfilment);
  const index = sequence.indexOf(stage);
  if (index <= 0) return null;
  return sequence[index - 1] ?? null;
}

/** Customer-facing stage labels, for the progress indicator. */
export const STAGE_LABELS: Record<Stage, string> = {
  address: "Where",
  type: "When",
  scope: "Details",
  duration: "How long",
  slot: "Choose a time",
  provider: "Professional",
  hold: "Holding your slot",
  precheck: "Checking availability",
  review: "Review",
  login: "Log in",
  pay: "Payment",
  assigning: "Finding your professional",
  confirmed: "Confirmed",
};
