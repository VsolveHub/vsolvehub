import { isMaterialAdvance } from "@vsolve/query";
import type { Engagement, EngagementStage } from "@vsolve/query";
import type { useT } from "@vsolve/ui";

/**
 * The words this column uses for the shared spine.
 *
 * One spine in the backend does not mean one noun in the UI. A stage is a
 * **shift-day** in the workforce workspace and a **stage** in the project one,
 * and `M2-FE-111` forbids flattening either into a generic "work item". So the
 * state machine is shared, the vocabulary is not, and this file is where the two
 * meet — a single `StageWording` value threaded down from the route rather than
 * a lifecycle inferred from a category anywhere below it.
 *
 * `getWorkforceWording`/`getProjectWording` take `t` because the four nouns are
 * locale text, not fixed English — a call site renders them inside sentences
 * (`describeEngagementStatus`, `stageTitle`), so they cannot be hard-coded here.
 */

export interface StageWording {
  /** "shift-day" / "stage". Lower case; sentences capitalise where they need to. */
  readonly one: string;
  readonly many: string;
  /** The record a stage belongs to: "booking" / "project". */
  readonly parent: string;
  readonly parentMany: string;
}

export function getWorkforceWording(t: ReturnType<typeof useT>): StageWording {
  return {
    one: t("work.engagementCopy.wording.workforce.one"),
    many: t("work.engagementCopy.wording.workforce.many"),
    parent: t("work.engagementCopy.wording.workforce.parent"),
    parentMany: t("work.engagementCopy.wording.workforce.parentMany"),
  };
}

export function getProjectWording(t: ReturnType<typeof useT>): StageWording {
  return {
    one: t("work.engagementCopy.wording.project.one"),
    many: t("work.engagementCopy.wording.project.many"),
    parent: t("work.engagementCopy.wording.project.parent"),
    parentMany: t("work.engagementCopy.wording.project.parentMany"),
  };
}

export type StatusTone = "action" | "info" | "neutral" | "warning" | "danger" | "success";

export interface StatusCopy {
  readonly label: string;
  readonly tone: StatusTone;
  /** What it means to the vendor, in one sentence. */
  readonly sentence: string;
}

/**
 * What an engagement status means to the vendor performing it.
 *
 * `null` for a status this build does not recognise — the caller renders "we
 * cannot describe this" rather than guessing, because the two available guesses
 * ("finished" and "needs attention") are both wrong in opposite directions.
 */
export function describeEngagementStatus(
  engagement: Engagement,
  wording: StageWording,
  t: ReturnType<typeof useT>,
): StatusCopy | null {
  switch (engagement.status) {
    case "PENDING_START":
      return {
        label: t("work.engagementCopy.status.engagement.pendingStart.label"),
        tone: "info",
        sentence: t("work.engagementCopy.status.engagement.pendingStart.sentence", {
          parent: wording.parent,
        }),
      };
    case "ACTIVE":
      return {
        label: t("work.engagementCopy.status.engagement.active.label"),
        tone: "action",
        sentence: t("work.engagementCopy.status.engagement.active.sentence", { parent: wording.parent }),
      };
    case "COMPLETING":
      return {
        label: t("work.engagementCopy.status.engagement.completing.label"),
        tone: "info",
        sentence: t("work.engagementCopy.status.engagement.completing.sentence", {
          one: wording.one,
          parent: wording.parent,
        }),
      };
    case "COMPLETED":
      return {
        label: t("work.engagementCopy.status.engagement.completed.label"),
        tone: "success",
        sentence: t("work.engagementCopy.status.engagement.completed.sentence"),
      };
    case "WARRANTY":
      return {
        label: t("work.engagementCopy.status.engagement.warranty.label"),
        tone: "info",
        sentence: t("work.engagementCopy.status.engagement.warranty.sentence"),
      };
    case "CLOSED":
      return {
        label: t("work.engagementCopy.status.engagement.closed.label"),
        tone: "neutral",
        sentence: t("work.engagementCopy.status.engagement.closed.sentence"),
      };
    case "DISPUTED":
      return {
        label: t("work.engagementCopy.status.engagement.disputed.label"),
        tone: "warning",
        sentence: t("work.engagementCopy.status.engagement.disputed.sentence", { one: wording.one }),
      };
    case "CANCELLED":
      return {
        label: t("work.engagementCopy.status.engagement.cancelled.label"),
        tone: "danger",
        sentence: t("work.engagementCopy.status.engagement.cancelled.sentence", {
          parent: wording.parent,
        }),
      };
    default:
      return null;
  }
}

/**
 * What a stage status means to the vendor.
 *
 * The two entries that matter most are `CORRECTION_REQUESTED` and `DISPUTED`,
 * and they are written to be impossible to confuse. A correction asks for the
 * **agreed** work to be done properly and moves no money; a dispute stops **one**
 * allocation and nothing else. A vendor who reads a correction as a price cut has
 * been told the wrong thing by their own app.
 */
export function describeStageStatus(
  stage: EngagementStage,
  wording: StageWording,
  t: ReturnType<typeof useT>,
): StatusCopy | null {
  switch (stage.status) {
    case "PENDING":
      return {
        label: t("work.engagementCopy.status.stage.pending.label"),
        tone: "neutral",
        sentence: t("work.engagementCopy.status.stage.pending.sentence"),
      };
    case "IN_PROGRESS":
      return {
        label: t("work.engagementCopy.status.stage.inProgress.label"),
        tone: "action",
        sentence: t("work.engagementCopy.status.stage.inProgress.sentence"),
      };
    case "AWAITING_REVIEW":
      return {
        label: t("work.engagementCopy.status.stage.awaitingReview.label"),
        tone: "info",
        sentence: t("work.engagementCopy.status.stage.awaitingReview.sentence"),
      };
    case "CORRECTION_REQUESTED":
      return {
        label: t("work.engagementCopy.status.stage.correctionRequested.label"),
        tone: "warning",
        sentence: t("work.engagementCopy.status.stage.correctionRequested.sentence"),
      };
    case "DISPUTED":
      return {
        label: t("work.engagementCopy.status.stage.disputed.label"),
        tone: "danger",
        sentence: t("work.engagementCopy.status.stage.disputed.sentence", { one: wording.one }),
      };
    case "APPROVED":
      return {
        label: t("work.engagementCopy.status.stage.approved.label"),
        tone: "success",
        sentence: t("work.engagementCopy.status.stage.approved.sentence"),
      };
    case "RELEASED":
      return {
        label: t("work.engagementCopy.status.stage.released.label"),
        tone: "success",
        sentence: t("work.engagementCopy.status.stage.released.sentence"),
      };
    default:
      return null;
  }
}

/** The stage's own name, degrading to its position when the label is blank. */
export function stageTitle(
  stage: EngagementStage,
  wording: StageWording,
  t: ReturnType<typeof useT>,
): string {
  const label = stage.label.trim();
  if (label !== "") return label;
  if (isMaterialAdvance(stage)) {
    return t("work.engagementCopy.materialsPosition", { position: stage.position });
  }
  const noun = wording.one.charAt(0).toUpperCase() + wording.one.slice(1);
  return `${noun} ${stage.position}`;
}

/**
 * Whether this row is money for materials rather than a piece of work.
 *
 * `EngagementStage.kind` is published at contract **1.26.0** — `WORK` |
 * `MATERIAL_ADVANCE` — and before it there was one row type for both, so a bag
 * of cement arrived on this screen as a milestone to be signed off as work. It
 * is one spine and one set of commands still; what the column carries is that a
 * material advance funds through its own payment purpose, is laid out after
 * every work milestone, and is **not** clawed back as unearned work if a
 * capability is suspended — the vendor has already bought the materials.
 *
 * Compared against the published enum rather than parsed out of a label. A
 * client reading "materials" out of the vendor's own wording would be inferring
 * a money rule from free text.
 *
 * Re-exported from `@vsolve/query` rather than reimplemented here. The Customer
 * app classifies the same rows, off the same `Schemas["EngagementStage"]`, by
 * the same rule; two copies of a money classification are two chances to
 * disagree about what a bag of cement is when a third `kind` is published.
 */
export { isMaterialAdvance };

/**
 * What a material advance is, said to the vendor on the row itself.
 *
 * Deliberately says what it *is* and not what will happen to it in a
 * cancellation: the recovery rules are the server's and the copy that would
 * describe them ("this is never refunded") is broader than the rule actually
 * published.
 */
export function materialAdvanceNote(t: ReturnType<typeof useT>): string {
  return t("work.engagementCopy.materialAdvanceNote");
}
