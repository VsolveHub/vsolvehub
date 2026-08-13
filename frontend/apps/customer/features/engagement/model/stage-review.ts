import type { EngagementCommercialMode, StageDisputeReason } from "@vsolve/query";

/**
 * What each button on the stage review does to money — decided here, worded in
 * `view/`.
 *
 * `M2-FE-609` is the most consequential screen in the wave because **approval
 * releases money**. The requirement is not that the screen carries a warning; it
 * is that what each control does to money is legible *before* it is pressed. So
 * the effect is modelled as a closed union rather than written into three
 * paragraphs of JSX, which is how the three sentences drift apart and how one of
 * them ends up describing the wrong archetype.
 *
 * The effect is a property of the **agreement**, not of the stage: the same
 * `POST .../approve/` releases held platform money on a managed engagement and
 * moves nothing at all on a lead-only one, because on a lead-only one nothing
 * was ever collected.
 */

export type StageMoneyEffect =
  /** Managed: writes the vendor's earning held, then it becomes payable. */
  | "releases_held_earning"
  /** Lead-only: nothing was collected, so nothing platform-side moves. */
  | "no_platform_money"
  /** A correction moves nothing at all, on either archetype. */
  | "moves_nothing"
  /** A dispute stops this stage's allocation and nothing else. */
  | "stops_this_allocation"
  /** The mode is one this build cannot describe. Say nothing about money. */
  | "unknown";

export function approvalMoneyEffect(
  mode: EngagementCommercialMode | null,
): StageMoneyEffect {
  if (mode === "MANAGED_PAYMENT_REQUIRED") return "releases_held_earning";
  if (mode === "LEAD_ONLY") return "no_platform_money";
  return "unknown";
}

/**
 * The dispute reasons, derived from the published enum rather than hand-written.
 *
 * Typed as the generated union, so a value added or renamed on the server is a
 * `pnpm typecheck` failure here rather than a `400` a Customer meets after
 * writing out what went wrong. The order is the order the server declares them
 * in, which runs from the most serious to the least specific.
 */
export const DISPUTE_REASONS: readonly StageDisputeReason[] = [
  "NOT_DONE",
  "PARTIALLY_DONE",
  "POOR_QUALITY",
  "WRONG_SCOPE",
  "OTHER",
];

/**
 * Whether a dispute may be submitted.
 *
 * A reason code is required by the endpoint; the note is not (`StageDisputeRequest`
 * defaults it to blank). The note is still **required by this screen** for
 * `OTHER`, because "another reason" with no words is a case Operations cannot
 * act on and a vendor cannot answer — and the stage stops moving either way.
 */
export function canSubmitDispute(
  reasonCode: StageDisputeReason | null,
  note: string,
): boolean {
  if (reasonCode === null) return false;
  if (reasonCode === "OTHER") return note.trim().length > 0;
  return true;
}

/**
 * Whether a correction request may be submitted.
 *
 * `StageCorrectionRequest.note` is required by the contract and is the entire
 * content of the request: a correction with no words is a stage sent back with
 * no instruction, which is a round trip that helps nobody.
 */
export function canSubmitCorrection(note: string): boolean {
  return note.trim().length > 0;
}
