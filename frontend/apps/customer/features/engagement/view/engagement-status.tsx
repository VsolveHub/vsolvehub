"use client";

import type { CustomerNextAction, EngagementStageStatus, EngagementStatus } from "@vsolve/query";
import { Badge } from "@vsolve/ui";
import type { BadgeProps } from "@vsolve/ui";

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
 */
export function nextActionCopy(action: CustomerNextAction, nouns: ModeNouns): string {
  switch (action) {
    case "review_stage":
      return `Check the work on one ${nouns.stage}`;
    case "accept_completion":
      return "Confirm the work is finished";
    case "fund_stage":
      return `Fund the next ${nouns.stage} to start it`;
    case "awaiting_case":
      return "We are looking into the problem you raised";
    case "awaiting_vendor":
      return "Nothing for you to do — it is with the professional";
    case "none":
      return "Nothing to do";
  }
}
