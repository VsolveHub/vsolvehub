import { type ReactNode } from "react";
import { Badge, type BadgeProps } from "./badge";

export type StatusCategory =
  | "case"
  | "case-severity"
  | "case-kind"
  | "partner-application"
  | "payout"
  | "refund"
  | "visit"
  | "privacy"
  | "document"
  | "stay-reservation"
  | "stay-deposit"
  | "stay-extension"
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
  "stay-reservation": {
    tones: {
      held: "warning",
      payment_pending: "warning",
      confirmed: "success",
      checked_in: "info",
      in_stay: "info",
      checked_out: "neutral",
      inspected: "info",
      settled: "success",
      completed: "success",
      cancelled: "neutral",
      no_show: "danger",
      early_checkout: "warning",
      disputed: "danger",
      recovery_required: "danger",
      failed: "danger",
      expired: "neutral",
    },
    labels: {
      held: "Price locked",
      payment_pending: "Payment pending",
      confirmed: "Confirmed",
      checked_in: "Checked in",
      in_stay: "In stay",
      checked_out: "Checked out",
      inspected: "Inspection in progress",
      settled: "Settled",
      completed: "Completed",
      cancelled: "Cancelled",
      no_show: "No show",
      early_checkout: "Early checkout",
      disputed: "Deposit disputed",
      recovery_required: "Recovery required",
      failed: "Failed",
      expired: "Hold expired",
    }
  },
  "stay-deposit": {
    tones: {
      required: "neutral",
      not_required: "neutral",
      authorized: "info",
      held: "info",
      partially_consumed: "warning",
      fully_consumed: "warning",
      released: "success",
      disputed: "danger",
      resolved: "success",
    },
    labels: {
      required: "Deposit required",
      not_required: "No deposit required",
      authorized: "Deposit authorized",
      held: "Held in escrow",
      partially_consumed: "Partially deducted",
      fully_consumed: "Fully deducted",
      released: "Refunded",
      disputed: "Under dispute",
      resolved: "Resolved",
    }
  },
  "stay-extension": {
    tones: {
      pending_payment: "warning",
      approved: "success",
      rejected: "danger",
      cancelled: "neutral",
    },
    labels: {
      pending_payment: "Pending payment",
      approved: "Approved",
      rejected: "Rejected",
      cancelled: "Cancelled",
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
