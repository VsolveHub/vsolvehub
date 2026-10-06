// Ported from frontend/apps/customer/features/engagement/view/engagement-status.tsx
import type {
  CustomerNextAction,
  EngagementStageStatus,
  EngagementStatus,
  StageKind,
} from "@vsolve/query/native";
import { Badge } from "@vsolve/mobile-ui";
import type { BadgeProps } from "@vsolve/mobile-ui";

import type { EngagementMode } from "../adapters";

/**
 * One copy table for every engagement screen — the two lists, the workspace and
 * the stage review.
 *
 * The same discipline `features/requirement/view/request-state.tsx` applies to a
 * request: a Customer must never read two explanations of one state, and the way
 * that happens is a list row and a detail header wording the same status
 * differently. Keyed on the generated unions, so a status added to the server is
 * a `pnpm typecheck` failure here rather than a blank cell in production.
 *
 * ## The nouns are per archetype and that is deliberate
 *
 * `08-frontend-information-architecture.md` principle 2: an A3 shift-day is a
 * *shift* and an A5 milestone is a *stage*. One backend spine does not mean one
 * word in the UI, and the words are what tell a Customer which promise they
 * bought.
 */

/* --------------------------------------------------------------------------
   Nouns
   -------------------------------------------------------------------------- */

export interface ModeNouns {
  /** "your booking" / "your project". Always lower case, used mid-sentence. */
  engagement: string;
  /** "Your booking" / "Your project". */
  engagementTitle: string;
  /** "day" / "stage". */
  stage: string;
  /** "days" / "stages". */
  stages: string;
  /** "The days you agreed" / "The stages". */
  stagesHeading: string;
}

const LEAD_ONLY_NOUNS: ModeNouns = {
  engagement: "booking",
  engagementTitle: "Your booking",
  stage: "day",
  stages: "days",
  stagesHeading: "The days you agreed",
};

const MANAGED_NOUNS: ModeNouns = {
  engagement: "project",
  engagementTitle: "Your project",
  stage: "stage",
  stages: "stages",
  stagesHeading: "The stages",
};

/**
 * The neutral nouns, for a mode this build cannot describe.
 *
 * Not a fallback to either real set: one would promise Vsolve protection that
 * may not exist and the other would deny protection that may. "Agreement" and
 * "part" claim nothing about who holds the money.
 */
const UNKNOWN_NOUNS: ModeNouns = {
  engagement: "agreement",
  engagementTitle: "Your agreement",
  stage: "part",
  stages: "parts",
  stagesHeading: "The parts of this agreement",
};

export function nounsFor(mode: EngagementMode): ModeNouns {
  if (mode === "lead_only") return LEAD_ONLY_NOUNS;
  if (mode === "managed") return MANAGED_NOUNS;
  return UNKNOWN_NOUNS;
}

/* --------------------------------------------------------------------------
   Stage kind — what this row's money is for
   -------------------------------------------------------------------------- */

/**
 * The words a stage row is allowed to use, decided by `EngagementStage.kind`.
 *
 * `kind` is published at 1.26.0 and it is not decoration. A `MATERIAL_ADVANCE`
 * is money **spent on goods**, so it is not recovered like an unearned work
 * stage when a project ends early (`M2-BE-543`, `GAP-028`) — and until this
 * table existed a bag of cement rendered as an ordinary fundable milestone with
 * "This is done properly" over the approve button. Nothing about the work-stage
 * copy was wrong; it was simply being read out over the wrong kind of money.
 *
 * Two things it deliberately does **not** change:
 *
 * - **It removes no control.** The server runs one spine: a material advance
 *   still funds, still takes evidence, still gets approved and can still be
 *   corrected or disputed. Hiding the dispute control on a materials row would
 *   take away the Customer's only objection to a delivery that never arrived.
 * - **It subtracts nothing.** A material advance funds at face value like every
 *   other row.
 */
export interface StageKindCopy {
  /** Rendered beside the status. Null for work — the ordinary case needs no tag. */
  badge: string | null;
  /** Why this money is being asked for, above the funding control. */
  fundingPurpose: string;
  /** The heading over the evidence list on the review. */
  evidenceHeading: string;
  /** The heading over the approve control. */
  approveHeading: string;
  /** The heading over the correction control. */
  correctionHeading: string;
  /** How the list row's "next action" line names this money. */
  fundNextAction: string;
}

function workCopy(nouns: ModeNouns): StageKindCopy {
  return {
    badge: null,
    fundingPurpose: `Funding this ${nouns.stage} is what starts it.`,
    evidenceHeading: "What the professional showed",
    approveHeading: "This is done properly",
    correctionHeading: "Something needs redoing",
    fundNextAction: `Fund the next ${nouns.stage} to start it`,
  };
}

const MATERIAL_ADVANCE_COPY: StageKindCopy = {
  badge: "Materials",
  // The sentence this whole field exists for. A Customer funding a milestone is
  // buying work that can be left undone and refunded; a Customer funding this is
  // buying goods that will exist. Those are different consents.
  fundingPurpose:
    "This pays for materials the professional buys for your job — it is not work being done. Once it is spent on goods it is not returned the way unfinished work is, so fund it when you are ready for them to buy.",
  evidenceHeading: "What the professional bought",
  approveHeading: "The materials are what we agreed",
  correctionHeading: "The materials are not right",
  fundNextAction: "Pay for the materials so the professional can buy them",
};

/**
 * A kind this build has never seen.
 *
 * Fail-closed, the same rule the commercial mode follows: the optimistic
 * fallback is "ordinary work milestone", which is the exact reading `kind` was
 * published to stop. The screens pair this with **no funding control**, because
 * asking somebody to pay for something we cannot name is worse than making them
 * wait for a newer build.
 */
const UNKNOWN_KIND_COPY: StageKindCopy = {
  badge: "We cannot describe this",
  fundingPurpose:
    "This app does not recognise what this money is for, so it is not going to guess. Contact support before paying anything against it.",
  evidenceHeading: "What the professional submitted",
  approveHeading: "Approving this",
  correctionHeading: "Asking for a change",
  fundNextAction: "Something on this needs paying for — we cannot describe it here",
};

export function stageKindCopy(kind: StageKind, nouns: ModeNouns): StageKindCopy {
  if (kind === "material_advance") return MATERIAL_ADVANCE_COPY;
  if (kind === "work") return workCopy(nouns);
  return UNKNOWN_KIND_COPY;
}

/**
 * What to call one row mid-sentence.
 *
 * "this day" / "this stage" for work — the archetype's own noun — and "this
 * materials payment" for an advance, because calling a bag of cement a stage is
 * the whole thing `kind` was published to stop. An unknown kind gets the
 * mode's neutral noun rather than a guess.
 */
export function stageRowNoun(kind: StageKind, nouns: ModeNouns): string {
  return kind === "material_advance" ? "materials payment" : nouns.stage;
}

export function StageKindBadge({ kind, nouns }: { kind: StageKind; nouns: ModeNouns }) {
  const copy = stageKindCopy(kind, nouns);
  if (copy.badge === null) return null;
  return <Badge tone={kind === "unknown" ? "neutral" : "info"}>{copy.badge}</Badge>;
}

/* --------------------------------------------------------------------------
   Statuses
   -------------------------------------------------------------------------- */

interface StatusCopy {
  label: string;
  tone: BadgeProps["tone"];
}

export const ENGAGEMENT_STATUS: Record<EngagementStatus, StatusCopy> = {
  PENDING_START: { label: "Not started", tone: "neutral" },
  ACTIVE: { label: "In progress", tone: "info" },
  COMPLETING: { label: "Waiting for you to confirm", tone: "warning" },
  COMPLETED: { label: "Finished", tone: "success" },
  // Deliberately not "Finished": a warranty window is a promise still running,
  // and a Customer who reads it as closed will not raise the problem in time.
  WARRANTY: { label: "Finished — warranty running", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
  DISPUTED: { label: "A problem is being looked at", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const STAGE_STATUS: Record<EngagementStageStatus, StatusCopy> = {
  PENDING: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  AWAITING_REVIEW: { label: "Waiting for you to check", tone: "warning" },
  APPROVED: { label: "You approved it", tone: "success" },
  CORRECTION_REQUESTED: { label: "Sent back to be corrected", tone: "warning" },
  DISPUTED: { label: "You raised a problem", tone: "danger" },
  RELEASED: { label: "Paid out", tone: "success" },
  /**
   * Contract 1.31.0 (`M2-BE-545`). Two paths reach it, and the copy has to be
   * true of both: a project **terminated early**, and a **material advance left
   * with the outgoing vendor** when a project transfers.
   *
   * **The badge says nothing about money, deliberately.** The obvious label here
   * is "Refunded", and it would be wrong: `_cancel_stage` leaves `amount_paise`,
   * `funded_paise` and `refunded_amount_paise` exactly as they are — the
   * agreement *was* that big and the money *was* collected, and shrinking the
   * totals to make a cancelled project look tidy would erase the record a
   * dispute reads. A terminated work stage does have its unearned funding
   * returned; a cancelled **material advance does not**, because the vendor
   * already bought the goods. One badge cannot claim both, so it claims neither
   * and the money panel keeps reporting the four published figures.
   *
   * What is true of every case is the server's own sentence: **nobody owes work
   * on this row any more.**
   *
   * `info` rather than the three tempting alternatives. `neutral` reads as
   * "nothing happened here" and something did. `warning` asks for an action the
   * Customer does not have — nothing on a cancelled row is theirs to do.
   * `danger` would paint a *transfer* red, which is the platform rescuing the
   * job rather than failing at it.
   */
  CANCELLED: { label: "Cancelled", tone: "info" },
};

export function EngagementStatusBadge({ status }: { status: EngagementStatus }) {
  const copy = ENGAGEMENT_STATUS[status];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}

export function StageStatusBadge({ status }: { status: EngagementStageStatus }) {
  const copy = STAGE_STATUS[status];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}

/* --------------------------------------------------------------------------
   The next action
   -------------------------------------------------------------------------- */

/**
 * The one sentence a list row ends on — `M2-FE-509`, `M2-FE-608`.
 *
 * A row that names two next actions names none, so `nextCustomerAction` returns
 * exactly one and this puts words on it. `awaiting_case` and `awaiting_vendor`
 * are two different kinds of waiting and are worded as such: one has somebody
 * working on it and the other is simply the vendor's move.
 *
 * `stageKind` is the kind of the row the action is *about*, when it is about
 * one. It is here rather than defaulted because "fund the next stage to start
 * it" is false of a material advance — nothing starts, goods get bought — and
 * this line is what a Customer reads before deciding whether to open anything.
 *
 * `null` means the row named an action whose stage this build could not find,
 * and it fails closed to `unknown` rather than to work. Defaulting to work here
 * would reintroduce the optimistic reading `UNKNOWN_KIND_COPY` exists to refuse,
 * on the one branch that asks for money.
 */
export function nextActionCopy(
  action: CustomerNextAction,
  nouns: ModeNouns,
  stageKind: StageKind | null = null,
): string {
  switch (action) {
    case "review_stage":
      if (stageKind === "material_advance") return "Check the materials on one line";
      if (stageKind === "work") return `Check the work on one ${nouns.stage}`;
      return `Check one ${nouns.stage}`;
    case "accept_completion":
      return "Confirm the work is finished";
    case "fund_stage":
      return stageKindCopy(stageKind ?? "unknown", nouns).fundNextAction;
    case "awaiting_case":
      return "We are looking into the problem you raised";
    case "awaiting_vendor":
      return "Nothing for you to do — it is with the professional";
    case "none":
      return "Nothing to do";
  }
}
