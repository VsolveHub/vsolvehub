import type { Engagement, EngagementStage } from "@vsolve/query";

/**
 * The words this column uses for the shared spine.
 *
 * One spine in the backend does not mean one noun in the UI. A stage is a
 * **shift-day** in the workforce workspace and a **stage** in the project one,
 * and `M2-FE-111` forbids flattening either into a generic "work item". So the
 * state machine is shared, the vocabulary is not, and this file is where the two
 * meet — a single `StageWording` value threaded down from the route rather than
 * a lifecycle inferred from a category anywhere below it.
 */

export interface StageWording {
  /** "shift-day" / "stage". Lower case; sentences capitalise where they need to. */
  readonly one: string;
  readonly many: string;
  /** The record a stage belongs to: "booking" / "project". */
  readonly parent: string;
  readonly parentMany: string;
}

export const WORKFORCE_WORDING: StageWording = {
  one: "shift-day",
  many: "shift-days",
  parent: "booking",
  parentMany: "bookings",
};

export const PROJECT_WORDING: StageWording = {
  one: "stage",
  many: "stages",
  parent: "project",
  parentMany: "projects",
};

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
): StatusCopy | null {
  switch (engagement.status) {
    case "PENDING_START":
      return {
        label: "Not started",
        tone: "info",
        sentence: `This ${wording.parent} is agreed. Nothing has begun yet.`,
      };
    case "ACTIVE":
      return {
        label: "Active",
        tone: "action",
        sentence: `Work is under way on this ${wording.parent}.`,
      };
    case "COMPLETING":
      return {
        label: "Awaiting sign-off",
        tone: "info",
        sentence: `Every ${wording.one} is settled. The customer confirms the ${wording.parent} is done.`,
      };
    case "COMPLETED":
      return {
        label: "Completed",
        tone: "success",
        sentence: "The customer has accepted the finished work.",
      };
    case "WARRANTY":
      return {
        label: "In warranty",
        tone: "info",
        sentence: "Finished, and inside the warranty period.",
      };
    case "CLOSED":
      return { label: "Closed", tone: "neutral", sentence: "Nothing further is expected." };
    case "DISPUTED":
      return {
        label: "One dispute open",
        tone: "warning",
        sentence: `One ${wording.one} is being argued about. Everything else carries on, and anything already paid out stays paid.`,
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        tone: "danger",
        sentence: `This ${wording.parent} was cancelled.`,
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
): StatusCopy | null {
  switch (stage.status) {
    case "PENDING":
      return { label: "Not started", tone: "neutral", sentence: "Nothing has begun here yet." };
    case "IN_PROGRESS":
      return {
        label: "In progress",
        tone: "action",
        sentence: "Yours to work on. Attach what you did, then send it for review.",
      };
    case "AWAITING_REVIEW":
      return {
        label: "With the customer",
        tone: "info",
        sentence: "Submitted. The customer is reviewing what you sent.",
      };
    case "CORRECTION_REQUESTED":
      return {
        label: "Sent back",
        tone: "warning",
        sentence:
          "The customer has asked for the agreed work to be done properly. Nothing about the " +
          "price or the scope has changed, and no money has moved.",
      };
    case "DISPUTED":
      return {
        label: "Disputed",
        tone: "danger",
        sentence:
          `This ${wording.one} is being argued about, and only this one. You can still attach ` +
          "evidence that answers it.",
      };
    case "APPROVED":
      return {
        label: "Approved",
        tone: "success",
        sentence: "The customer accepted this work.",
      };
    case "RELEASED":
      return { label: "Settled", tone: "success", sentence: "Approved, and the hold is over." };
    default:
      return null;
  }
}

/** The stage's own name, degrading to its position when the label is blank. */
export function stageTitle(stage: EngagementStage, wording: StageWording): string {
  const label = stage.label.trim();
  if (label !== "") return label;
  const noun = wording.one.charAt(0).toUpperCase() + wording.one.slice(1);
  return `${noun} ${stage.position}`;
}
