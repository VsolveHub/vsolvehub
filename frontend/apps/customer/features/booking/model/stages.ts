/**
 * The M1 stage sequence.
 *
 * There is exactly one. The previous design had two — Instant and Scheduled —
 * with a provider picker and a capacity hold in the Scheduled branch. ADR-018
 * moved Instant to M4, ADR-014 removed the provider picker and ADR-013 made
 * capacity a `PartnerReservation` created by *Partner acceptance* rather than by
 * customer selection. What is left is a single list, so it is modelled as one.
 *
 * ## The ordering that matters
 *
 * M1 obtains an informed Partner acceptance *before* the customer pays
 * (ADR-012). That is the inversion from every ordinary e-commerce checkout and
 * the reason `finding` sits between `login` and `pay`:
 *
 *   quote accepted → customer logs in → platform offers the job to eligible
 *   Partners in turn → one accepts and commits → only then is payment enabled
 *
 * The customer cannot reach `pay` without a committed Partner, and the search is
 * bounded (180 seconds) and cancellable at no charge throughout. Encoding this as
 * list position rather than as a conditional is what makes "payment is
 * unreachable before Partner commitment" checkable instead of reviewable.
 *
 * ## Why there is no duration stage
 *
 * A1 is task-priced (ADR-008). The customer buys task units; `estimated_minutes`
 * reserves Partner capacity but does not change the price. A duration control
 * would let the customer adjust a number that alters neither what they pay nor
 * what the Partner is asked to do. Duration is shown as a derived readout in
 * `scope` and `review`, never as an input.
 */

export const STAGES = [
  "address",
  "scope",
  "window",
  "review",
  "login",
  "finding",
  "pay",
  "confirmed",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * The one sequence.
 *
 * Login sits after review (M1 §Customer journey): a logged-out customer
 * configures and reviews freely, and authenticates only when the next action
 * needs a server cart — which, here, is the Partner search.
 */
const SEQUENCE: readonly Stage[] = STAGES;

/**
 * Stages F2 implements.
 *
 * `login` is F2's own resume handling; `finding`, `pay` and `confirmed` are
 * modelled here so the ordering rule is enforced and testable, and are built
 * once `POST /checkout-sessions/` is published (proposal 0003 §B3).
 */
export const STAGES_IMPLEMENTED: readonly Stage[] = [
  "address",
  "scope",
  "window",
  "review",
] as const;

export function sequence(): readonly Stage[] {
  return SEQUENCE;
}

export function sequenceContains(stage: Stage): boolean {
  return SEQUENCE.includes(stage);
}

export function stageIndex(stage: Stage): number {
  return SEQUENCE.indexOf(stage);
}

/** The stage after `stage`, or null at the end of the sequence. */
export function nextStage(stage: Stage): Stage | null {
  const index = SEQUENCE.indexOf(stage);
  if (index === -1 || index === SEQUENCE.length - 1) return null;
  return SEQUENCE[index + 1] ?? null;
}

/** The stage before `stage`, or null at the start. */
export function previousStage(stage: Stage): Stage | null {
  const index = SEQUENCE.indexOf(stage);
  if (index <= 0) return null;
  return SEQUENCE[index - 1] ?? null;
}

/**
 * True once the customer has committed money or capacity.
 *
 * From `finding` onward a Partner has been offered real work and a reservation
 * may exist, so the workspace stops being freely editable — going back would
 * silently invalidate an offer someone has already answered.
 */
export function isCommitted(stage: Stage): boolean {
  return stageIndex(stage) >= stageIndex("finding");
}

/** Customer-facing stage labels, for the progress indicator. */
export const STAGE_LABELS: Record<Stage, string> = {
  address: "Where",
  scope: "What you need",
  window: "When",
  review: "Review",
  login: "Log in",
  finding: "Finding a professional",
  pay: "Payment",
  confirmed: "Confirmed",
};
