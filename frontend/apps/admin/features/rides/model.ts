/** Plain words for the ride states, the filters, and what Operations may do (brief §5.4). */

export const OPEN_STATES = ["SEARCHING", "CAPTAIN_ASSIGNED", "CAPTAIN_ARRIVED", "IN_TRIP"] as const;

export const STATE_LABEL: Record<string, string> = {
  SEARCHING: "Searching",
  CAPTAIN_ASSIGNED: "Captain on the way",
  CAPTAIN_ARRIVED: "Captain at pickup",
  IN_TRIP: "In trip",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_CAPTAIN_FOUND: "No captain found",
};

export type StateTone = "info" | "success" | "warning" | "neutral";

export function stateTone(state: string): StateTone {
  if (isOpen(state)) return "info";
  if (state === "COMPLETED") return "success";
  if (state === "NO_CAPTAIN_FOUND") return "warning";
  return "neutral";
}

export function stateLabel(state: string): string {
  return STATE_LABEL[state] ?? state;
}

export function isOpen(state: string): boolean {
  return (OPEN_STATES as readonly string[]).includes(state);
}

/** Operations can close any open ride, even one in trip; never a finished one (brief §5.4). */
export const canForceCancel = isOpen;

/** The list filters, each the comma-separated `?state=` the server takes. */
export const RIDE_FILTERS = [
  { key: "live", label: "Live", states: OPEN_STATES.join(",") },
  { key: "completed", label: "Completed", states: "COMPLETED" },
  { key: "cancelled", label: "Cancelled", states: "CANCELLED" },
  { key: "no-captain", label: "No captain", states: "NO_CAPTAIN_FOUND" },
] as const;

export type RideFilterKey = (typeof RIDE_FILTERS)[number]["key"];

/** The force-cancel reason the server accepts: required, at most 64 characters. */
export const CANCEL_REASON_MAX = 64;

export function cancelReasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Say why you are cancelling.";
  if (trimmed.length > CANCEL_REASON_MAX) return `Keep it under ${CANCEL_REASON_MAX} characters.`;
  return null;
}

export const ACTOR_LABEL: Record<string, string> = {
  RIDER: "Rider",
  CAPTAIN: "Captain",
  OPERATIONS: "Operations",
  SYSTEM: "System",
};

export const OFFER_LABEL: Record<string, string> = {
  PENDING: "Waiting",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "No answer",
  WITHDRAWN: "Withdrawn",
};

/** "1.2 km" or "350 m". */
export function distanceText(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

/** A Google Maps link for where an SOS was raised, or null when the phone sent no place. */
export function mapLink(latitude: string | null, longitude: string | null): string | null {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
