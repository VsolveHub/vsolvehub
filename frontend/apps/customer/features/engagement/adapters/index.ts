import {
  fundedTotalPaise,
  isKnownCommercialMode,
  isLeadOnly,
  nextFundableStage,
  type Engagement,
  type EngagementStage,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

/**
 * The engagement wire, turned into something a screen can render.
 *
 * Same layering as the other three features. The one judgement here is that
 * **`commercial_mode` is carried through as a decided fact rather than as a
 * string**: `mode` below is a closed union with an `unknown` member, so a screen
 * cannot fall through to the optimistic reading of a mode this build has never
 * heard of — and on this surface the optimistic reading is "protected booking",
 * which is the one claim M2 must not make wrongly.
 */

export type EngagementMode = "lead_only" | "managed" | "unknown";

export interface StageView {
  stageId: string;
  position: number;
  label: string;
  amountLabel: string;
  scheduledOn: string | null;
  status: EngagementStage["status"];
  fundingState: EngagementStage["funding_state"];
  /** True for the one stage the Customer is being asked to fund now. */
  isNextToFund: boolean;
  /** True while a funding charge on this stage is unresolved. */
  isFundingPending: boolean;
}

export interface EngagementView {
  engagementId: string;
  /**
   * The request this came out of.
   *
   * Carried because the engagement route has no requirement in its path — a
   * Customer arriving from a notification months later holds an engagement id
   * and nothing else — and the full history still has to be one link away.
   */
  requirementId: string;
  mode: EngagementMode;
  status: Engagement["status"];
  totalLabel: string;
  taxLabel: string;
  /**
   * How platform commission is treated on this agreement.
   *
   * A free-text field with no published vocabulary, carried verbatim or null.
   * See `features/quotes/adapters` for why nothing here invents a code.
   */
  commissionTreatment: string | null;
  /** Summed from `FUNDED` stages. The only derived number on this screen. */
  fundedLabel: string;
  stages: readonly StageView[];
  /** Null on A3, and on A5 whenever nothing is currently fundable. */
  nextFundableStageId: string | null;
  /** When contact may be exchanged. A3 at engagement creation; A5 at first funding. */
  contactReleasedAt: string | null;
  /** When work may begin, on the server's own record. */
  workMayStartAt: string | null;
  createdAt: string;
}

function toMode(engagement: Engagement): EngagementMode {
  if (!isKnownCommercialMode(engagement)) return "unknown";
  return isLeadOnly(engagement) ? "lead_only" : "managed";
}

export function toEngagementView(engagement: Engagement): EngagementView {
  const nextStage = nextFundableStage(engagement);

  const stages = [...engagement.stages]
    .sort((left, right) => left.position - right.position)
    .map(
      (stage): StageView => ({
        stageId: stage.id,
        position: stage.position,
        // A stage stored with no label still has a position, and "Stage 2" is a
        // truthful name for it. An empty heading is not.
        label: stage.label.trim() === "" ? `Stage ${stage.position}` : stage.label,
        amountLabel: formatMoney(stage.amount_paise),
        scheduledOn: stage.scheduled_on,
        status: stage.status,
        fundingState: stage.funding_state,
        isNextToFund: nextStage !== null && nextStage.id === stage.id,
        isFundingPending: stage.funding_state === "PENDING",
      }),
    );

  return {
    engagementId: engagement.id,
    requirementId: engagement.requirement,
    mode: toMode(engagement),
    status: engagement.status,
    totalLabel: formatMoney(engagement.total_paise),
    taxLabel: formatMoney(engagement.tax_paise),
    commissionTreatment:
      engagement.commission_treatment.trim() === "" ? null : engagement.commission_treatment,
    fundedLabel: formatMoney(fundedTotalPaise(engagement)),
    stages,
    nextFundableStageId: nextStage?.id ?? null,
    contactReleasedAt: engagement.contact_released_at,
    workMayStartAt: engagement.work_may_start_at,
    createdAt: engagement.created_at,
  };
}
