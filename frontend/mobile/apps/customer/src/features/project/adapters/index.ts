// Ported from frontend/apps/customer/features/project/adapters/index.ts
import {
  canAcceptHandover,
  delayClaimsNewestFirst,
  deliverableLink,
  handoverBlocksCompletion,
  handoverPhase,
  hasOutstandingMaterialAdvance,
  isDelayClaimApplied,
  isDelayClaimDecidable,
  isKnownDelayClaimStatus,
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
  type ProjectDelayClaim,
  type ProjectDelayClaimStatus,
  type ProjectDeliverableKind,
  type ProjectPlan,
  type ProjectTransferStatus,
  type RetentionPhase,
  type StageKind,
  type TransferDirection,
} from "@vsolve/query/native";
import { formatMoney } from "@vsolve/mobile-ui";

import { formatInstant, type EvidenceView } from "@/features/engagement/adapters";

export interface MilestoneView {
  stageId: string;
  position: number;
  label: string;
  kind: StageKind;
  amountLabel: string;
  fundedLabel: string;
  fundedPaise: number;
  isCancelled: boolean;
  isLeftWithVendor: boolean;
}

function toMilestoneView(milestone: ProjectPlan["milestones"][number]): MilestoneView {
  return {
    stageId: milestone.stage_id,
    position: milestone.position,
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

export interface RetentionView {
  phase: RetentionPhase;
  targetLabel: string;
  withheldLabel: string;
  warrantyEndsAt: string | null;
  isRunning: boolean;
}

export interface DeliverableView {
  deliverableId: string;
  kind: ProjectDeliverableKind;
  title: string;
  link: string | null;
  milestoneLabel: string | null;
  submittedAt: string | null;
  file: EvidenceView | null;
  fileRecordMissing: boolean;
}

export interface HandoverView {
  phase: HandoverPhase;
  submittedAt: string | null;
  acceptedAt: string | null;
  note: string | null;
  deliverables: readonly DeliverableView[];
  canAccept: boolean;
  blocksCompletion: boolean;
}

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
  previousRemainingLabel: string;
  replacementRemainingLabel: string;
  deltaLabel: string;
  refundedLabel: string;
  hasRefund: boolean;
  materialOutstandingLabel: string;
  hasMaterialOutstanding: boolean;
  reasonCode: string | null;
  note: string | null;
  expiresAt: string | null;
  expiresAtIso: string;
  decidedAt: string | null;
  appliedAt: string | null;
  lines: readonly TransferLineView[] | null;
}

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
  const position = new Map(milestones.map((milestone) => [milestone.stageId, milestone.position]));
  return lines.sort(
    (left, right) => (position.get(left.stageId) ?? 0) - (position.get(right.stageId) ?? 0),
  );
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

export interface DelayClaimView {
  claimId: string;
  milestoneLabel: string | null;
  reasonCode: string | null;
  description: string;
  extensionDays: number;
  appliedDays: number;
  status: ProjectDelayClaimStatus;
  isKnownStatus: boolean;
  isDecidable: boolean;
  isApplied: boolean;
  expiresAt: string | null;
  expiresAtIso: string;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string | null;
  evidence: readonly EvidenceView[];
  missingEvidenceCount: number;
}

function toDelayClaimView(
  claim: ProjectDelayClaim,
  labelByStageId: ReadonlyMap<string, string>,
  evidenceById: ReadonlyMap<string, EvidenceView>,
): DelayClaimView {
  const evidence: EvidenceView[] = [];
  let missing = 0;
  for (const evidenceId of claim.evidence) {
    const row = evidenceById.get(evidenceId);
    if (row === undefined) missing += 1;
    else evidence.push(row);
  }

  return {
    claimId: claim.id,
    milestoneLabel: labelByStageId.get(claim.stage) ?? null,
    reasonCode: claim.reason_code.trim() === "" ? null : claim.reason_code,
    description: claim.description,
    extensionDays: claim.extension_days,
    appliedDays: claim.applied_days,
    status: claim.status,
    isKnownStatus: isKnownDelayClaimStatus(claim),
    isDecidable: isDelayClaimDecidable(claim),
    isApplied: isDelayClaimApplied(claim),
    expiresAt: formatInstant(claim.expires_at),
    expiresAtIso: claim.expires_at,
    decidedAt: formatInstant(claim.decided_at),
    decisionNote: claim.decision_note.trim() === "" ? null : claim.decision_note,
    createdAt: formatInstant(claim.created_at),
    evidence,
    missingEvidenceCount: missing,
  };
}

export interface ProjectView {
  engagementId: string;
  status: EngagementStatus;
  milestones: readonly MilestoneView[];
  leftWithVendor: readonly MilestoneView[];
  retention: RetentionView;
  handover: HandoverView;
  transfer: TransferView | null;
  delayClaims: readonly DelayClaimView[];
}

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
    delayClaims: delayClaimsNewestFirst(plan).map((claim) =>
      toDelayClaimView(claim, labelByStageId, evidenceById),
    ),
  };
}

export function evidenceIndex(
  stages: readonly { evidence: readonly EvidenceView[] }[],
): ReadonlyMap<string, EvidenceView> {
  const index = new Map<string, EvidenceView>();
  for (const stage of stages) {
    for (const evidence of stage.evidence) index.set(evidence.evidenceId, evidence);
  }
  return index;
}

