import { type ReactNode } from "react";
import { Badge, type BadgeProps } from "./badge";

export type StatusCategory =
  | "case"
  | "case-severity"
  | "case-kind"
  | "partner-application"
  | "listing"
  | "listing-application"
  | "payout"
  | "refund"
  | "visit"
  | "privacy"
  | "document"
  | "generic";

export interface StatusChipProps {
  /** The raw status string from the backend */
  status: string | null | undefined;
  /** The domain context for mapping labels and tones */
  category?: StatusCategory;
  /** Fallback label if the status isn't mapped */
  fallbackLabel?: ReactNode;
  /** Force a specific tone regardless of status */
  forceTone?: BadgeProps["tone"];
}

const REGISTRY: Record<StatusCategory, { 
  tones: Record<string, BadgeProps["tone"]>, 
  labels: Record<string, string> 
}> = {
  case: {
    tones: {
      open: "warning",
      escalated: "danger",
      resolved: "success",
      closed: "neutral",
    },
    labels: {
      open: "Open",
      escalated: "Escalated",
      resolved: "Resolved",
      closed: "Closed",
    }
  },
  "case-severity": {
    tones: {
      low: "neutral",
      medium: "warning",
      high: "danger",
      critical: "danger",
    },
    labels: {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
    }
  },
  "case-kind": {
    tones: {}, // mostly neutral for kinds
    labels: {
      damage: "Damage report",
      no_show: "Provider no-show",
      safety: "Safety incident",
      dispute: "Payment dispute",
    }
  },
  "partner-application": {
    tones: {
      draft: "neutral",
      submitted: "info",
      under_review: "info",
      changes_required: "warning",
      approved: "success",
      suspended: "warning",
      offboarded: "danger",
    },
    labels: {
      draft: "Draft",
      submitted: "Submitted",
      under_review: "Under review",
      changes_required: "Changes required",
      approved: "Approved",
      suspended: "Suspended",
      offboarded: "Offboarded",
    },
  },
  listing: {
    tones: {
      draft: "neutral",
      pending_review: "warning",
      rejected: "danger",
      published: "success",
      closed: "neutral",
      removed: "danger",
      expired: "neutral",
      archived: "neutral",
    },
    labels: {
      draft: "Draft",
      pending_review: "In Review",
      rejected: "Rejected",
      published: "Live & Active",
      closed: "Closed",
      removed: "Removed",
      expired: "Expired",
      archived: "Archived",
    },
  },
  "listing-application": {
    tones: {
      submitted: "info",
      under_review: "warning",
      shortlisted: "success",
      contacted: "info",
      rejected: "danger",
      withdrawn: "neutral",
      expired: "neutral",
    },
    labels: {
      submitted: "Applied",
      under_review: "Under review",
      shortlisted: "Shortlisted",
      contacted: "Contacted",
      rejected: "Not selected",
      withdrawn: "Withdrawn",
      expired: "Closed",
    },
  },
  payout: {
    tones: {
      pending: "warning",
      processing: "info",
      paid: "success",
      failed: "danger",
    },
    labels: {
      pending: "Pending",
      processing: "Processing",
      paid: "Paid",
      failed: "Failed",
    }
  },
  refund: {
    tones: {
      requested: "info",
      approved: "success",
      processing: "warning",
      failed: "danger",
    },
    labels: {
      requested: "Requested",
      approved: "Approved",
      processing: "Processing",
      failed: "Failed",
    }
  },
  visit: {
    tones: {
      scheduled: "info",
      en_route: "warning",
      in_progress: "warning",
      completed: "success",
      cancelled: "neutral",
    },
    labels: {
      scheduled: "Scheduled",
      en_route: "En route",
      in_progress: "In progress",
      completed: "Completed",
      cancelled: "Cancelled",
    }
  },
  privacy: {
    tones: {
      pending: "warning",
      in_progress: "info",
      completed: "success",
      rejected: "danger",
    },
    labels: {
      pending: "Pending",
      in_progress: "In progress",
      completed: "Completed",
      rejected: "Rejected",
    }
  },
  document: {
    tones: {
      missing: "danger",
      uploaded: "info",
      verified: "success",
      rejected: "danger",
    },
    labels: {
      missing: "Missing",
      uploaded: "Uploaded",
      verified: "Verified",
      rejected: "Rejected",
    }
  },
  generic: {
    tones: {
      active: "success",
      inactive: "neutral",
      pending: "warning",
      error: "danger",
    },
    labels: {}
  }
};

/**
 * Unifies status badge colors and text across the application.
 * Looks up the correct color tone and human-readable label based on the category.
 */
export function StatusChip({ status, category = "generic", fallbackLabel, forceTone }: StatusChipProps) {
  if (!status) {
    return <Badge tone="neutral">{fallbackLabel || "Unknown"}</Badge>;
  }

  const normalizedStatus = status.toLowerCase();
  const mapping = REGISTRY[category];
  
  const tone = forceTone || mapping.tones[normalizedStatus] || "neutral";
  const label = mapping.labels[normalizedStatus] || fallbackLabel || status;

  return (
    <Badge tone={tone}>
      {label}
    </Badge>
  );
}
