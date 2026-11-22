import type { Schemas } from "@vsolve/api-client";

type ApplicationStatus = Schemas["PartnerApplicationStatusEnum"];
type DocumentStatus = Schemas["PartnerDocumentStatusEnum"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];
type Document = Schemas["PartnerDocument"];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusPresentation {
  readonly tone: Tone;
  /** Short label for a badge. */
  readonly labelKey: string;
  readonly label: string;
  /** One line: where the application is. */
  readonly headlineKey: string;
  readonly headline: string;
  /** One line: what happens next, or what the Partner should do. */
  readonly nextKey: string;
  readonly next: string;
}

const APPLICATION: Record<ApplicationStatus, StatusPresentation> = {
  DRAFT: {
    tone: "neutral",
    labelKey: "apply.status.draft.label",
    label: "Draft",
    headlineKey: "apply.status.draft.headline",
    headline: "Finish your application",
    nextKey: "apply.status.draft.next",
    next: "Complete the steps below, then send it.",
  },
  SUBMITTED: {
    tone: "info",
    labelKey: "apply.status.submitted.label",
    label: "Sent",
    headlineKey: "apply.status.submitted.headline",
    headline: "We have your application",
    nextKey: "apply.status.waiting.next",
    next: "Nothing to do now. We'll notify you when it's decided.",
  },
  UNDER_REVIEW: {
    tone: "info",
    labelKey: "apply.status.underReview.label",
    label: "In review",
    headlineKey: "apply.status.underReview.headline",
    headline: "A reviewer is checking it",
    nextKey: "apply.status.waiting.next",
    next: "Nothing to do now. We'll notify you when it's decided.",
  },
  CHANGES_REQUIRED: {
    tone: "warning",
    labelKey: "apply.status.changesRequired.label",
    label: "Changes needed",
    headlineKey: "apply.status.changesRequired.headline",
    headline: "Fix what the reviewer asked for",
    nextKey: "apply.status.changesRequired.next",
    next: "Make the change, then send it again.",
  },
  APPROVED: {
    tone: "success",
    labelKey: "apply.status.approved.label",
    label: "Approved",
    headlineKey: "apply.status.approved.headline",
    headline: "You're approved",
    nextKey: "apply.status.approved.next",
    next: "Open your workspace to start.",
  },
  DECLINED: {
    tone: "danger",
    labelKey: "apply.status.declined.label",
    label: "Not approved",
    headlineKey: "apply.status.declined.headline",
    headline: "Your application was not approved",
    nextKey: "apply.status.contactSupport.next",
    next: "Contact support if you have questions.",
  },
  SUSPENDED: {
    tone: "danger",
    labelKey: "apply.status.suspended.label",
    label: "Paused",
    headlineKey: "apply.status.suspended.headline",
    headline: "Your account is paused",
    nextKey: "apply.status.contactSupport.next",
    next: "Contact support if you have questions.",
  },
  OFFBOARDED: {
    tone: "neutral",
    labelKey: "apply.status.offboarded.label",
    label: "Closed",
    headlineKey: "apply.status.offboarded.headline",
    headline: "Your account is closed",
    nextKey: "apply.status.contactSupport.next",
    next: "Contact support if you have questions.",
  },
};

export function applicationStatusPresentation(status: ApplicationStatus): StatusPresentation {
  return APPLICATION[status] ?? APPLICATION.DRAFT;
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

export function documentStatusPresentation(
  document: Pick<Document, "status" | "scan_status">,
): { tone: Tone; labelKey: string; label: string } {
  if (document.status === "REJECTED" || document.scan_status === "REJECTED") {
    return { tone: "danger", labelKey: "apply.documents.status.rejected", label: "Needs replacing" };
  }
  const byStatus: Record<DocumentStatus, { tone: Tone; labelKey: string; label: string }> = {
    PENDING: { tone: "info", labelKey: "apply.documents.status.pending", label: "Waiting for review" },
    APPROVED: { tone: "success", labelKey: "apply.documents.status.approved", label: "Approved" },
    REJECTED: { tone: "danger", labelKey: "apply.documents.status.rejected", label: "Needs replacing" },
    SUPERSEDED: { tone: "neutral", labelKey: "apply.documents.status.superseded", label: "Replaced" },
  };
  return byStatus[document.status];
}

export function isDocumentRejected(document: Pick<Document, "status" | "scan_status">): boolean {
  return document.status === "REJECTED" || document.scan_status === "REJECTED";
}

const DOCUMENT_LABEL_KEYS: Record<DocumentKind, { key: string; label: string }> = {
  GOVERNMENT_ID: { key: "apply.requirements.governmentId", label: "Government photo ID" },
  ADDRESS_PROOF: { key: "apply.requirements.addressProof", label: "Proof of address" },
  TAX: { key: "apply.overview.documentLabels.tax", label: "Tax document" },
  BANK: { key: "apply.overview.documentLabels.bank", label: "Bank document" },
  BACKGROUND_CHECK: { key: "apply.overview.documentLabels.backgroundCheck", label: "Background check" },
  SELFIE: { key: "apply.overview.documentLabels.selfie", label: "Selfie" },
  BUSINESS_PROOF: { key: "apply.overview.documentLabels.businessProof", label: "Business proof" },
  AUTHORIZATION_LETTER: {
    key: "apply.overview.documentLabels.authorizationLetter",
    label: "Authorization letter",
  },
  DRIVING_LICENCE: { key: "apply.overview.documentLabels.drivingLicence", label: "Driving licence" },
  VEHICLE_RC: { key: "apply.overview.documentLabels.vehicleRc", label: "Vehicle RC" },
  VEHICLE_INSURANCE: {
    key: "apply.overview.documentLabels.vehicleInsurance",
    label: "Vehicle insurance",
  },
  OTHER: { key: "apply.overview.documentLabels.other", label: "Document" },
};

export function documentLabelKey(kind: DocumentKind): string {
  return DOCUMENT_LABEL_KEYS[kind]?.key ?? "apply.overview.documentLabels.other";
}

export function documentLabel(kind: DocumentKind): string {
  return DOCUMENT_LABEL_KEYS[kind]?.label ?? "Document";
}

const TRACK_LABELS: Record<Schemas["TrackEnum"], { key: string; label: string }> = {
  SERVICES: { key: "apply.track.services", label: "Home services" },
  STAY_HOST: { key: "apply.track.stays", label: "Stays" },
  RENTAL_OWNER: { key: "apply.track.rentals", label: "Rentals" },
  EMPLOYER: { key: "apply.track.employer", label: "Hiring" },
  RIDE_CAPTAIN: { key: "apply.track.rideCaptain", label: "Rides" },
};

export function trackLabelKey(track: Schemas["TrackEnum"] | null | undefined): string {
  return track ? TRACK_LABELS[track]?.key ?? "apply.track.services" : "apply.track.services";
}

export function trackLabel(track: Schemas["TrackEnum"] | null | undefined): string {
  return track ? TRACK_LABELS[track]?.label ?? "Home services" : "Home services";
}

/** An application that has been sent and is waiting for a decision. */
export function isWaitingForDecision(status: string | null | undefined): boolean {
  return status === "SUBMITTED" || status === "UNDER_REVIEW";
}

/**
 * Where someone goes once their application is sent (or opens its status).
 *
 * The website has no separate status page: `/apply` shows "We have your application", the steps
 * and "What has happened" for an application in review. A decision that needs an answer (declined,
 * rejected) keeps the status screen, where the appeal lives.
 */
export function statusRouteFor(status: string | null | undefined): "/apply" | "/apply/status" {
  return isWaitingForDecision(status) ? "/apply" : "/apply/status";
}
