import type { Schemas } from "@vsolve/api-client";

export type CaptainStatus = Schemas["CaptainStatus"];
export type BlockedReason = "suspended" | "not_approved" | "vehicle_missing" | "pass_required";

/**
 * Whether this partner gets the Rides workspace instead of the normal tabs (brief Revision 2):
 * an approved captain, on Android only. Everyone else, every iPhone, and a captain whose
 * application is still a draft, sent or under review keeps the app exactly as it was.
 *
 * Approved only: the Rides pages are for approved partners, so the guard sends anyone else back
 * to Home. Giving them the Rides shell too would send Home on to Rides, and Rides back to Home,
 * forever (a submitted application crashed the app with "Maximum update depth exceeded").
 */
export function isCaptainShell(status: CaptainStatus | null | undefined, os: string): boolean {
  return os === "android" && status?.approval === "APPROVED";
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
