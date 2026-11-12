import type { Schemas } from "@vsolve/api-client";

export type CaptainStatus = Schemas["CaptainStatus"];
export type BlockedReason = "suspended" | "not_approved" | "vehicle_missing" | "pass_required";

/**
 * Whether this partner gets the Rides workspace instead of the normal tabs (brief Revision 2):
 * a partner with a captain application, on Android only. A partner who is not a captain, and
 * every iPhone, keeps the app exactly as it was.
 */
export function isCaptainShell(status: CaptainStatus | null | undefined, os: string): boolean {
  return os === "android" && status != null && status.approval !== "NOT_STARTED";
}

const BLOCKED_TEXT: Record<BlockedReason, string> = {
  suspended: "Your captain account is suspended. Contact support.",
  not_approved: "You can go on duty once your captain application is approved.",
  vehicle_missing: "Your vehicle details are missing. Contact support to add them.",
  pass_required: "Buy a pass in Wallet to go on duty.",
};

/** Why the captain cannot go on duty, in the order the server gives, as plain sentences. */
export function blockedReasonTexts(reasons: readonly string[]): string[] {
  return reasons.map((reason) => BLOCKED_TEXT[reason as BlockedReason] ?? "You can't go on duty yet.");
}

/** "Bike", "Auto" or "Cab" for a vehicle type from the server. */
export function vehicleTypeName(type: string): string {
  if (type === "BIKE") return "Bike";
  if (type === "AUTO") return "Auto";
  if (type === "CAB") return "Cab";
  return type;
}
