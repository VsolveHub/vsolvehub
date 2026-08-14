import {
  canAcceptHandover,
  deliverableLink,
  handoverBlocksCompletion,
  handoverPhase,
  hasOutstandingMaterialAdvance,
  isKnownTransferStatus,
  isMaterialAdvanceLeftWithVendor,
  isMilestoneCancelled,
  isTransferApplied,
  isTransferDecidable,
  isWarrantyRunning,
  milestoneKind,
  milestonesInOrder,
  retentionPhase,
  transferDirection,
  transferStagePrices,
  type EngagementStatus,
  type HandoverPhase,
  type ProjectDeliverableKind,
  type ProjectPlan,
  type ProjectTransferStatus,
  type RetentionPhase,
  type StageKind,
  type TransferDirection,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

import { formatInstant, type EvidenceView } from "@/features/engagement/adapters";

/**
 * The A5 project wire, turned into something a screen can render.
 *
 * Same layering as every other feature in this app, and three rules carry the
 * whole file:
 *
 * **Every money figure below is a published field, formatted.** Not one is
 * added, multiplied or subtracted. The transfer's `deltaLabel` is the server's
 * own `delta_paise` — held equal to the difference of the two remaining totals
 * by a database constraint — rather than this file subtracting them, and the
 * retention is the two published numbers side by side rather than a percentage
 * applied to anything.
 *
 * **Nothing predicts a refund.** `refundedLabel` is `refunded_paise`, which is
 * what actually went back and is **zero on a proposal**. The unearned funding a
 * transfer would return is knowable — `funded - refunded - released` per
 * transferable milestone — and it is deliberately not computed here: a
 * conditional number rendered as a figure is a promise, and this one is
 * conditional on a decision the Customer has not taken.
 *
 * **A file the Customer cannot open is said out loud.** A `FILE` deliverable is
 * a row on the stage evidence rail, whose `object_key` is unpublished and for
 * which no download route exists (§7, since `M2-FE-609`). The row is joined to
 * the engagement read so the panel can at least report what the record knows —
 * scanned, pending, rejected — and it says plainly when the record cannot be
 * found at all, because the Customer is being asked to **accept** these.
 */

/* --------------------------------------------------------------------------
   Milestones
   -------------------------------------------------------------------------- */

export interface MilestoneView {
  stageId: string;
  position: number;
  label: string;
  kind: StageKind;
  amountLabel: string;
  fundedLabel: string;
  fundedPaise: number;
  /** Nobody owes work on this row any more — a termination or a transfer. */
  isCancelled: boolean;
  /**
   * A funded material advance the outgoing vendor kept.
   *
   * The one row on a project that is **not** getting refunded by anything, ever.
   * It is its own flag rather than a `kind` check because a cancelled *unfunded*
   * material advance cost the Customer nothing and calling that a loss would be
   * inventing one.
   */
  isLeftWithVendor: boolean;
}

function toMilestoneView(milestone: ProjectPlan["milestones"][number]): MilestoneView {
  return {
    stageId: milestone.stage_id,
    position: milestone.position,
    // A milestone stored with no label still has a position, and "Stage 2" is a
    // truthful name for it. An empty heading is not.
    label:
      milestone.milestone_label.trim() === ""
        ? `Stage ${milestone.position}`
        : milestone.milestone_label,
    kind: milestoneKind(milestone),
    amountLabel: formatMoney(milestone.amount_paise),
    fundedLabel: formatMoney(milestone.funded_paise),
    fundedPaise: milestone.funded_paise,
    isCancelled: isMilestoneCancelled(milestone),
    isLeftWithVendor: isMaterialAdvanceLeftWithVendor(milestone),
  };
}

/* --------------------------------------------------------------------------
   Warranty retention
   -------------------------------------------------------------------------- */

export interface RetentionView {
  phase: RetentionPhase;
  /** Where the hold-back is going. `retention_paise`. */
  targetLabel: string;
  /** What has actually been held so far. `retention_withheld_paise`. */
  withheldLabel: string;
  /** The warranty end, as a person reads it. Null until the last milestone is approved. */
  warrantyEndsAt: string | null;
  /** True only while the window is actually running — read from `status`. */
  isRunning: boolean;
}

/* --------------------------------------------------------------------------
   The handover
   -------------------------------------------------------------------------- */

export interface DeliverableView {
  deliverableId: string;
  kind: ProjectDeliverableKind;
  title: string;
  /** An https location, for a `LINK`. Null on a `FILE` and on a scheme we refuse. */
  link: string | null;
  /** The milestone it was filed against, when the row named one we can resolve. */
  milestoneLabel: string | null;
  submittedAt: string | null;
  /**
   * The evidence row this file is, joined off the engagement read.
   *
   * Null on a `LINK`, which has no file — and null on a `FILE` whose evidence id
   * is not in the engagement's stages, which is `fileRecordMissing` below rather
   * than "no file".
   */
  file: EvidenceView | null;
  fileRecordMissing: boolean;
}

export interface HandoverView {
  phase: HandoverPhase;
  submittedAt: string | null;
  acceptedAt: string | null;
  /** The vendor's own words with the handover. Blank is a real state. */
  note: string | null;
  deliverables: readonly DeliverableView[];
  canAccept: boolean;
  /** While true, `m2_engagement_completion_accept` refuses. */
  blocksCompletion: boolean;
}

/* --------------------------------------------------------------------------
   The vendor transfer
   -------------------------------------------------------------------------- */

/** One milestone in the transfer, at both prices. Never a lump. */
export interface TransferLineView {
  stageId: string;
  label: string;
  agreedLabel: string;
  replacementLabel: string;
}

export interface TransferView {
  transferId: string;
  status: ProjectTransferStatus;
  isKnownStatus: boolean;
  isDecidable: boolean;
  isApplied: boolean;
  direction: TransferDirection;
  /** What the current professional was owed for the unfinished work. */
  previousRemainingLabel: string;
  /** What the replacement wants for the same list of work. */
  replacementRemainingLabel: string;
  /** The published difference, unsigned for the sentence. Never subtracted here. */
  deltaLabel: string;
  /** What actually went back. Zero on a proposal — nothing has moved yet. */
  refundedLabel: string;
  hasRefund: boolean;
  /** Money already spent on goods, which this transfer leaves where it is. */
  materialOutstandingLabel: string;
  hasMaterialOutstanding: boolean;
  /** Operations' own reason code, carried verbatim. */
  reasonCode: string | null;
  note: string | null;
  expiresAt: string | null;
  /** Raw, for `useServerCountdown` — a formatted date is the device's reading. */
  expiresAtIso: string;
  decidedAt: string | null;
  appliedAt: string | null;
  /**
   * The per-milestone prices, or null when they could not be trusted.
   *
   * Null means the panel shows the two totals alone. It is **not** a shorter
   * list: an incomplete table would restate less work than is being priced,
   * which is the exact thing the server refuses to let a vendor do.
   */
  lines: readonly TransferLineView[] | null;
}

function toTransferView(
  transfer: NonNullable<ProjectPlan["transfer"]>,
  milestones: readonly MilestoneView[],
): TransferView {
  return {
    transferId: transfer.id,
    status: transfer.status,
    isKnownStatus: isKnownTransferStatus(transfer),
    isDecidable: isTransferDecidable(transfer),
    isApplied: isTransferApplied(transfer),
    direction: transferDirection(transfer),
    previousRemainingLabel: formatMoney(transfer.previous_remaining_paise),
    replacementRemainingLabel: formatMoney(transfer.replacement_remaining_paise),
    // `Math.abs` on a published number, for the sentence — the direction is
    // carried by `direction` rather than by a minus sign in the middle of a
    // paragraph. The same thing the amendment panel does with its own delta.
    deltaLabel: formatMoney(Math.abs(transfer.delta_paise)),
    refundedLabel: formatMoney(transfer.refunded_paise),
    hasRefund: transfer.refunded_paise > 0,
    materialOutstandingLabel: formatMoney(transfer.material_advance_outstanding_paise),
    hasMaterialOutstanding: hasOutstandingMaterialAdvance(transfer),
    reasonCode: transfer.reason_code.trim() === "" ? null : transfer.reason_code,
    note: transfer.note.trim() === "" ? null : transfer.note,
    expiresAt: formatInstant(transfer.expires_at),
    expiresAtIso: transfer.expires_at,
    decidedAt: formatInstant(transfer.decided_at),
    appliedAt: formatInstant(transfer.applied_at),
    lines: toTransferLines(transfer, milestones),
  };
}

/**
 * Join the replacement's prices to the milestones they are for.
 *
 * The keys of `stage_prices` are the **authoritative** list of what transfers —
 * better than re-deriving the server's status filter in a browser, which is a
 * rule that would then have two implementations. Fails closed to null on a key
 * this project has no milestone for, for the same reason `transferStagePrices`
 * fails closed on a bad value: a table that silently drops a row is a shorter
 * list of work than the one the two totals are sums over.
 */
function toTransferLines(
  transfer: NonNullable<ProjectPlan["transfer"]>,
  milestones: readonly MilestoneView[],
): readonly TransferLineView[] | null {
  const prices = transferStagePrices(transfer);
  if (prices === null) return null;

  const byStageId = new Map(milestones.map((milestone) => [milestone.stageId, milestone]));
  const lines: TransferLineView[] = [];
  for (const [stageId, amountPaise] of prices) {
    const milestone = byStageId.get(stageId);
    if (milestone === undefined) return null;
    lines.push({
      stageId,
      label: milestone.label,
      agreedLabel: milestone.amountLabel,
      replacementLabel: formatMoney(amountPaise),
    });
  }
  // Agreement order, not the order the prices happened to be stored in.
  const position = new Map(milestones.map((milestone) => [milestone.stageId, milestone.position]));
  return lines.sort(
    (left, right) => (position.get(left.stageId) ?? 0) - (position.get(right.stageId) ?? 0),
  );
}

/* --------------------------------------------------------------------------
   The project
   -------------------------------------------------------------------------- */

export interface ProjectView {
  engagementId: string;
  status: EngagementStatus;
  milestones: readonly MilestoneView[];
  /** Funded material advances the outgoing vendor kept. Empty is the normal case. */
  leftWithVendor: readonly MilestoneView[];
  retention: RetentionView;
  handover: HandoverView;
  transfer: TransferView | null;
}

/**
 * @param plan The project read.
 * @param evidenceById Every piece of stage evidence on the engagement, by id, so
 *   a `FILE` deliverable can report what the record knows about it. The project
 *   read carries only the evidence **id**; the row itself is on the engagement.
 */
export function toProjectView(
  plan: ProjectPlan,
  evidenceById: ReadonlyMap<string, EvidenceView>,
): ProjectView {
  const milestones = milestonesInOrder(plan).map(toMilestoneView);
  const labelByStageId = new Map(
    milestones.map((milestone) => [milestone.stageId, milestone.label]),
  );

  return {
    engagementId: plan.engagement_id,
    status: plan.status,
    milestones,
    leftWithVendor: milestones.filter((milestone) => milestone.isLeftWithVendor),
    retention: {
      phase: retentionPhase(plan),
      targetLabel: formatMoney(plan.retention_paise),
      withheldLabel: formatMoney(plan.retention_withheld_paise),
      warrantyEndsAt: formatInstant(plan.warranty_ends_at),
      isRunning: isWarrantyRunning(plan),
    },
    handover: {
      phase: handoverPhase(plan),
      submittedAt: formatInstant(plan.handover.submitted_at),
      acceptedAt: formatInstant(plan.handover.accepted_at),
      note: plan.handover.note.trim() === "" ? null : plan.handover.note,
      deliverables: plan.handover.deliverables.map((deliverable) => {
        const evidenceId = deliverable.evidence;
        const file = evidenceId === null ? null : (evidenceById.get(evidenceId) ?? null);
        return {
          deliverableId: deliverable.id,
          kind: deliverable.kind,
          title: deliverable.title.trim() === "" ? "Untitled" : deliverable.title,
          link: deliverableLink(deliverable),
          milestoneLabel:
            deliverable.stage === null ? null : (labelByStageId.get(deliverable.stage) ?? null),
          submittedAt: formatInstant(deliverable.created_at),
          file,
          fileRecordMissing: deliverable.kind === "FILE" && file === null,
        };
      }),
      canAccept: canAcceptHandover(plan),
      blocksCompletion: handoverBlocksCompletion(plan),
    },
    transfer: plan.transfer === null ? null : toTransferView(plan.transfer, milestones),
  };
}

/**
 * Every piece of evidence on an engagement, by id.
 *
 * Built from the engagement read the screen already holds rather than from a
 * second request: `ProjectDeliverable.evidence` is a bare id and the rows
 * themselves hang off the stages. A deliverable whose id is absent from this map
 * renders as a record we cannot find, never as a file that is fine.
 */
export function evidenceIndex(
  stages: readonly { evidence: readonly EvidenceView[] }[],
): ReadonlyMap<string, EvidenceView> {
  const index = new Map<string, EvidenceView>();
  for (const stage of stages) {
    for (const evidence of stage.evidence) index.set(evidence.evidenceId, evidence);
  }
  return index;
}
