/**
 * What a Partner is told about their own availability.
 *
 * The distinction that matters: **online** is a claim only the server can make.
 * This model exists so the UI can never say "you are online" from local state —
 * it can say the server confirmed a session, that the last heartbeat is getting
 * old, or that we do not currently know.
 */

export type PresenceStatus =
  /** No session; no offers will arrive. */
  | "offline"
  /** Asking the browser for a location, or asking Django for a session. */
  | "connecting"
  /** Django confirmed a session and the heartbeat is fresh. */
  | "online"
  /**
   * A session exists but the heartbeat is overdue. Availability is in doubt,
   * and saying "online" here is the specific lie this state prevents.
   */
  | "stale"
  /** The browser refused a location, so no session can be created. */
  | "location_denied"
  /** Something failed and we cannot say what the server thinks. */
  | "unknown";

/**
 * How long after the last confirmed heartbeat availability becomes doubtful.
 *
 * Deliberately generous relative to the send interval: a single missed beat is a
 * dropped packet, not a Partner who has vanished, and flipping to "stale" on
 * every blip trains people to ignore the indicator.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const STALE_AFTER_MS = 90_000;

export interface PresenceInput {
  hasSession: boolean;
  /** Milliseconds since the last heartbeat Django acknowledged. */
  msSinceHeartbeat: number | null;
  isConnecting: boolean;
  locationDenied: boolean;
  hasFailed: boolean;
}

export function presenceStatus(input: PresenceInput): PresenceStatus {
  if (input.locationDenied) return "location_denied";
  if (input.isConnecting) return "connecting";
  if (!input.hasSession) return input.hasFailed ? "unknown" : "offline";
  if (input.msSinceHeartbeat === null) return "unknown";
  return input.msSinceHeartbeat > STALE_AFTER_MS ? "stale" : "online";
}

export interface PresenceCopy {
  label: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

/**
 * Copy for each state.
 *
 * Only `online` promises offers, and only because the server confirmed a live
 * session. Every other state says plainly what will and will not happen.
 */
export const PRESENCE_COPY: Record<PresenceStatus, PresenceCopy> = {
  offline: {
    label: "Offline",
    detail: "You will not be offered any jobs until you go online.",
    tone: "neutral",
  },
  connecting: {
    label: "Going online",
    detail: "Confirming your location with us. You are not receiving jobs yet.",
    tone: "neutral",
  },
  online: {
    label: "Online",
    detail: "You can be offered jobs in your area right now.",
    tone: "success",
  },
  stale: {
    label: "Connection lost",
    detail:
      "We have not heard from your phone recently, so you may not be offered jobs. Check your signal.",
    tone: "warning",
  },
  location_denied: {
    label: "Location needed",
    detail:
      "We need your location to offer you nearby jobs. Allow location for this site, then go online again.",
    tone: "danger",
  },
  unknown: {
    label: "Not sure",
    detail:
      "We could not confirm whether you are online. Do not rely on this — check again in a moment.",
    tone: "warning",
  },
};
