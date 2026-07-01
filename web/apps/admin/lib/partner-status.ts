import type { PartnerStatus } from "@vsolve/db";

type Tone = "success" | "warning" | "danger" | "brand" | "neutral";

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  ACTION_REQUIRED: "Action required",
  ACTIVE: "Active",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

export const STATUS_TONE: Record<PartnerStatus, Tone> = {
  DRAFT: "neutral",
  PENDING: "brand",
  ACTION_REQUIRED: "warning",
  ACTIVE: "success",
  REJECTED: "danger",
  SUSPENDED: "neutral",
};

/** Review-queue tabs, in display order. DRAFT (not yet submitted) is excluded. */
export const STATUS_TABS: { value: PartnerStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "ACTION_REQUIRED", label: "Action required" },
  { value: "ACTIVE", label: "Active" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SUSPENDED", label: "Suspended" },
];

export type PartnerDecision =
  | "APPROVED"
  | "REQUESTED_CHANGES"
  | "REJECTED"
  | "SUSPENDED"
  | "REACTIVATED";

/** Single source of truth for the partner status state machine — shared by the
 *  server actions (validation) and the detail page (which buttons to show). */
export const ALLOWED_FROM: Record<PartnerDecision, PartnerStatus[]> = {
  APPROVED: ["PENDING", "ACTION_REQUIRED"],
  REQUESTED_CHANGES: ["PENDING", "ACTION_REQUIRED"],
  REJECTED: ["PENDING", "ACTION_REQUIRED"],
  SUSPENDED: ["ACTIVE"],
  REACTIVATED: ["SUSPENDED"],
};

export const RESULT_STATUS: Record<PartnerDecision, PartnerStatus> = {
  APPROVED: "ACTIVE",
  REQUESTED_CHANGES: "ACTION_REQUIRED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
  REACTIVATED: "ACTIVE",
};

export function canApply(decision: PartnerDecision, current: PartnerStatus): boolean {
  return ALLOWED_FROM[decision].includes(current);
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
