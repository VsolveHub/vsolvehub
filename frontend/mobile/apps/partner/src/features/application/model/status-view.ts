import type { Schemas } from "@vsolve/api-client";

export type ApplicationStatusView = "in_review" | "changes_needed" | "approved" | "rejected";

type Application = Schemas["PartnerApplication"];
type Document = Schemas["PartnerDocument"];

export interface ResolveStatusViewOptions {
  hasExpiredDoc?: boolean;
}

/**
 * Resolves the presentation view for an onboarding application and its documents.
 *
 * Precedence rule:
 * 1. rejected — a final decision (DECLINED/REJECTED) overrides everything, even approved or expired documents.
 * 2. changes_needed — CHANGES_REQUIRED or any rejected/expired document requiring partner action.
 * 3. approved — APPROVED application status.
 * 4. in_review — SUBMITTED or UNDER_REVIEW waiting states.
 */
export function resolveStatusView(
  application: Pick<Application, "status"> | Application | null | undefined,
  documents?: (Pick<Document, "status"> | Document)[] | null,
  options?: ResolveStatusViewOptions,
): ApplicationStatusView {
  const status = application?.status;

  // 1. Final rejection overrides everything (even approved docs or expired docs)
  if (status === "DECLINED" || (status as string) === "REJECTED") {
    return "rejected";
  }

  // Check document statuses
  const docs = documents ?? (application && "documents" in application ? application.documents : []) ?? [];
  const hasRejectedDoc = docs.some(
    // Only one the Partner can act on: an old rejected file that was replaced needs nothing.
    (d) => d.status === "REJECTED" && "can_replace" in d && d.can_replace,
  );

  // 2. Changes needed takes precedence over approved and in_review
  if (status === "CHANGES_REQUIRED" || hasRejectedDoc || options?.hasExpiredDoc) {
    return "changes_needed";
  }

  // 3. Approved
  if (status === "APPROVED") {
    return "approved";
  }

  // 4. Default in review (SUBMITTED, UNDER_REVIEW, or fallback)
  return "in_review";
}

/**
 * Extracts the rejection reason from an application's transition history.
 * Returns empty string if no reason was provided.
 */
export function extractRejectionReason(
  application: Application | null | undefined,
): string {
  if (!application) return "";

  // Check transition history for application_declined or transition to DECLINED
  if (application.transitions && application.transitions.length > 0) {
    const declinedTransition = [...application.transitions]
      .reverse()
      .find((t) => t.to_status === "DECLINED" || t.reason_code === "application_declined");

    if (declinedTransition?.reason?.trim()) {
      return declinedTransition.reason.trim();
    }
  }

  // Check change_request_message as fallback
  if (application.change_request_message?.trim()) {
    return application.change_request_message.trim();
  }

  // Check if any rejected document has a review reason
  if (application.documents && application.documents.length > 0) {
    const rejectedDoc = application.documents.find(
      (d) => d.status === "REJECTED" && Boolean(d.review_reason?.trim()),
    );
    if (rejectedDoc?.review_reason?.trim()) {
      return rejectedDoc.review_reason.trim();
    }
  }

  return "";
}

/**
 * Formats timestamps into the spec format: "26 Oct 2026, 6:39 pm"
 * (day, short month, year, 12-hour clock, lowercase am/pm in Indian Standard Time / locale).
 */
export function formatSpecTimestamp(isoString: string | null | undefined, fallback: string): string {
  if (!isoString) return fallback;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return fallback;

    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(date);

    return formatted.replace(/am|pm|AM|PM/, (m) => m.toLowerCase());
  } catch {
    return fallback;
  }
}

/**
 * Extracts timestamps for the 3-node timeline in Screen 10 / Screen 7-9.
 */
export function extractTimelineDates(
  application: Application | null | undefined,
): {
  submittedAt: string | null;
  inReviewAt: string | null;
  decidedAt: string | null;
} {
  if (!application) {
    return { submittedAt: null, inReviewAt: null, decidedAt: null };
  }

  const submittedAt = application.submitted_at ?? null;

  // inReviewAt: review_assigned_at, or transition to UNDER_REVIEW, or submitted_at
  let inReviewAt = application.review_assigned_at ?? null;
  if (!inReviewAt && application.transitions) {
    const reviewTrans = application.transitions.find((t) => t.to_status === "UNDER_REVIEW");
    if (reviewTrans?.occurred_at) {
      inReviewAt = reviewTrans.occurred_at;
    }
  }

  // decidedAt: reviewed_at, or transition to DECLINED / APPROVED
  let decidedAt = application.reviewed_at ?? null;
  if (!decidedAt && application.transitions) {
    const decTrans = application.transitions.find(
      (t) => t.to_status === "DECLINED" || t.to_status === "APPROVED",
    );
    if (decTrans?.occurred_at) {
      decidedAt = decTrans.occurred_at;
    }
  }

  return { submittedAt, inReviewAt, decidedAt };
}

