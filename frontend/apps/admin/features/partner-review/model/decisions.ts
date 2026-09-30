import type { Schemas } from "@vsolve/api-client";

/**
 * What a reviewer may do to an application, and what each decision costs.
 *
 * Operations acts through domain commands, never database edits, so the set of
 * available actions is a property of the application's current status rather
 * than a menu that is always the same. A reviewer who can click "Approve" on an
 * already-approved application will eventually click it.
 *
 * Every decision here is recorded against a version. The transition endpoint
 * takes `expected_version` for the same reason the Partner's own edits do: two
 * reviewers can have the same application open, and the second one must find out
 * rather than overwrite the first.
 */

type Status = Schemas["PartnerApplicationStatusEnum"];
type TargetStatus = Schemas["TargetStatusEnum"];

export interface ReviewAction {
  target: TargetStatus;
  label: string;
  /** What the Partner experiences, so the reviewer knows what they are sending. */
  consequence: string;
  /**
   * Whether a written reason must accompany the decision.
   *
   * Required wherever the Partner has to act on it or loses access. A
   * `CHANGES_REQUIRED` with no note is the single most common way onboarding
   * stalls: the Partner is told to fix something and not told what.
   */
  requiresReason: boolean;
  tone: "primary" | "neutral" | "danger";
}

const START_REVIEW: ReviewAction = {
  target: "UNDER_REVIEW",
  label: "Start review",
  consequence: "The Partner sees that a reviewer is looking at their documents.",
  requiresReason: false,
  tone: "primary",
};

const REQUEST_CHANGES: ReviewAction = {
  target: "CHANGES_REQUIRED",
  label: "Request changes",
  consequence:
    "The application reopens for editing and the Partner sees your note. Say exactly what to fix.",
  requiresReason: true,
  tone: "neutral",
};

const APPROVE: ReviewAction = {
  target: "APPROVED",
  label: "Approve",
  consequence:
    "The Partner may publish hours and receive job offers for the services and areas on this application.",
  requiresReason: false,
  tone: "primary",
};

const SUSPEND: ReviewAction = {
  target: "SUSPENDED",
  label: "Suspend",
  consequence:
    "The Partner stops receiving offers immediately. Work already accepted is not cancelled by this — handle it separately.",
  requiresReason: true,
  tone: "danger",
};

const OFFBOARD: ReviewAction = {
  target: "OFFBOARDED",
  label: "Offboard",
  consequence: "The Partner account is closed. This is not routinely reversible.",
  requiresReason: true,
  tone: "danger",
};

const REINSTATE: ReviewAction = {
  target: "APPROVED",
  label: "Reinstate",
  consequence: "The Partner may receive offers again.",
  requiresReason: true,
  tone: "primary",
};

/**
 * Actions available from each status.
 *
 * `DRAFT` has none: an application the Partner has not submitted is not a
 * reviewer's to act on, and reaching into one would be exactly the database-edit
 * habit the plan forbids.
 */
/**
 * Mirrors `transition_partner_application` allowed edges in
 * `backend/apps/partners/services/review.py`. Offering a button the server
 * rejects is how reviewers burn a click and trust.
 *
 * `CHANGES_REQUIRED` has no Operations transitions: the Partner resubmits, which
 * returns the application to `SUBMITTED` / `UNDER_REVIEW` via the Partner path.
 */
const ACTIONS: Record<Status, readonly ReviewAction[]> = {
  DRAFT: [],
  SUBMITTED: [START_REVIEW],
  UNDER_REVIEW: [REQUEST_CHANGES, APPROVE],
  CHANGES_REQUIRED: [],
  APPROVED: [SUSPEND, OFFBOARD],
  SUSPENDED: [REINSTATE, OFFBOARD],
  OFFBOARDED: [],
};

export function availableActions(status: Status): readonly ReviewAction[] {
  return ACTIONS[status];
}

export function isActionAvailable(status: Status, target: TargetStatus): boolean {
  return ACTIONS[status].some((action) => action.target === target);
}

/** Whether the reviewer has supplied everything this decision needs. */
export function canSubmitDecision(action: ReviewAction, reason: string): boolean {
  return action.requiresReason ? reason.trim().length > 0 : true;
}

/**
 * Documents still waiting on a decision.
 *
 * A reviewer approving an application whose documents nobody looked at is the
 * failure this list exists to make visible.
 */
export function pendingDocuments(
  application: Schemas["PartnerApplication"],
): Schemas["PartnerDocument"][] {
  return application.documents.filter((document) => document.status === "PENDING");
}

/**
 * Whether approving would leave unreviewed documents behind.
 *
 * A warning rather than a block: Django owns the rule, and there may be
 * legitimate cases — a superseded set, a document type no longer required — that
 * the client cannot see.
 */
export function hasUnreviewedDocuments(
  application: Schemas["PartnerApplication"],
): boolean {
  return pendingDocuments(application).length > 0;
}
