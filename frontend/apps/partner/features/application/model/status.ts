import type { Schemas } from "@vsolve/api-client";

/**
 * How an application status, a document status, a document kind and a track are named and
 * coloured — once, for every onboarding screen.
 *
 * The hub, the documents step, the review step and the post-approval documents page each used to
 * carry their own copy of these, and they disagreed ("Needs replacing" here, "Rejected" there,
 * "Action Required" on a third). Everything returns catalogue keys, so the same word appears in
 * every language.
 */

type ApplicationStatus = Schemas["PartnerApplicationStatusEnum"];
type DocumentStatus = Schemas["PartnerDocumentStatusEnum"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];
type Document = Schemas["PartnerDocument"];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusPresentation {
  readonly tone: Tone;
  /** Short label for a badge. */
  readonly labelKey: string;
  /** One line: where the application is. */
  readonly headlineKey: string;
  /** One line: what happens next, or what the Partner should do. */
  readonly nextKey: string;
}

const APPLICATION: Record<ApplicationStatus, StatusPresentation> = {
  DRAFT: {
    tone: "neutral",
    labelKey: "apply.status.draft.label",
    headlineKey: "apply.status.draft.headline",
    nextKey: "apply.status.draft.next",
  },
  SUBMITTED: {
    tone: "info",
    labelKey: "apply.status.submitted.label",
    headlineKey: "apply.status.submitted.headline",
    nextKey: "apply.status.waiting.next",
  },
  UNDER_REVIEW: {
    tone: "info",
    labelKey: "apply.status.underReview.label",
    headlineKey: "apply.status.underReview.headline",
    nextKey: "apply.status.waiting.next",
  },
  CHANGES_REQUIRED: {
    tone: "warning",
    labelKey: "apply.status.changesRequired.label",
    headlineKey: "apply.status.changesRequired.headline",
    nextKey: "apply.status.changesRequired.next",
  },
  APPROVED: {
    tone: "success",
    labelKey: "apply.status.approved.label",
    headlineKey: "apply.status.approved.headline",
    nextKey: "apply.status.approved.next",
  },
  DECLINED: {
    tone: "danger",
    labelKey: "apply.status.declined.label",
    headlineKey: "apply.status.declined.headline",
    nextKey: "apply.status.contactSupport.next",
  },
  SUSPENDED: {
    tone: "danger",
    labelKey: "apply.status.suspended.label",
    headlineKey: "apply.status.suspended.headline",
    nextKey: "apply.status.contactSupport.next",
  },
  OFFBOARDED: {
    tone: "neutral",
    labelKey: "apply.status.offboarded.label",
    headlineKey: "apply.status.offboarded.headline",
    nextKey: "apply.status.contactSupport.next",
  },
};

export function applicationStatusPresentation(status: ApplicationStatus): StatusPresentation {
  return APPLICATION[status];
}

/**
 * Where an application is on the four-stop path a Partner sees: fill in, sent, in review,
 * decided. Changes requested goes back to the first stop, because that is where the work is.
 */
export function trackerStage(status: ApplicationStatus): 0 | 1 | 2 | 3 {
  switch (status) {
    case "DRAFT":
    case "CHANGES_REQUIRED":
      return 0;
    case "SUBMITTED":
      return 1;
    case "UNDER_REVIEW":
      return 2;
    case "APPROVED":
    case "DECLINED":
    case "SUSPENDED":
    case "OFFBOARDED":
      return 3;
  }
}

/**
 * A document's badge. A failed scan reads as "needs replacing" like a reviewer's rejection:
 * either way the Partner's next move is the same, a new file.
 */
export function documentStatusPresentation(
  document: Pick<Document, "status" | "scan_status">,
): { tone: Tone; labelKey: string } {
  if (document.status === "REJECTED" || document.scan_status === "REJECTED") {
    return { tone: "danger", labelKey: "apply.documents.status.rejected" };
  }
  const byStatus: Record<DocumentStatus, { tone: Tone; labelKey: string }> = {
    PENDING: { tone: "info", labelKey: "apply.documents.status.pending" },
    APPROVED: { tone: "success", labelKey: "apply.documents.status.approved" },
    REJECTED: { tone: "danger", labelKey: "apply.documents.status.rejected" },
    SUPERSEDED: { tone: "neutral", labelKey: "apply.documents.status.superseded" },
  };
  return byStatus[document.status];
}

export function isDocumentRejected(document: Pick<Document, "status" | "scan_status">): boolean {
  return document.status === "REJECTED" || document.scan_status === "REJECTED";
}

const DOCUMENT_LABEL_KEYS: Record<DocumentKind, string> = {
  GOVERNMENT_ID: "apply.requirements.governmentId",
  ADDRESS_PROOF: "apply.requirements.addressProof",
  TAX: "apply.overview.documentLabels.tax",
  BANK: "apply.overview.documentLabels.bank",
  BACKGROUND_CHECK: "apply.overview.documentLabels.backgroundCheck",
  OTHER: "apply.overview.documentLabels.other",
};

export function documentLabelKey(kind: DocumentKind): string {
  return DOCUMENT_LABEL_KEYS[kind];
}

const TRACK_LABEL_KEYS: Record<Schemas["TrackEnum"], string> = {
  SERVICES: "apply.track.services",
  STAY_HOST: "apply.track.stays",
  RENTAL_OWNER: "apply.track.rentals",
  EMPLOYER: "apply.track.employer",
};

export function trackLabelKey(track: Schemas["TrackEnum"] | null | undefined): string {
  return track ? TRACK_LABEL_KEYS[track] : "apply.track.services";
}

/** The version of a kind that counts now: the newest one not replaced by another. */
export function currentDocument(
  application: Pick<Schemas["PartnerApplication"], "documents">,
  kind: DocumentKind,
): Document | null {
  return (
    application.documents
      .filter((document) => document.kind === kind && document.status !== "SUPERSEDED")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}
