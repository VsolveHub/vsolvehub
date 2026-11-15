/**
 * What stands between a captain and going on duty on this phone, in the brief's order (§5.13):
 * the disclosure, location ("While using the app", precise), notifications, then battery help.
 * There is no "Allow all the time" step: the app never asks for background location.
 */
export type LocationAccess = "precise" | "approximate" | "denied" | "undetermined";
export type PushAccess = "granted" | "denied" | "undetermined" | "unavailable";
export type SetupStep = "disclosure" | "location" | "location_denied" | "precise" | "notifications" | "battery" | "ready";

interface PermissionLike {
  granted: boolean;
  canAskAgain: boolean;
  android?: { accuracy: "fine" | "coarse" | "none" } | null;
}

export function locationAccess(permission: PermissionLike): LocationAccess {
  if (permission.granted) return permission.android?.accuracy === "coarse" ? "approximate" : "precise";
  return permission.canAskAgain ? "undetermined" : "denied";
}

export interface SetupState {
  disclosureSeen: boolean;
  location: LocationAccess;
  notifications: PushAccess;
  /** Asked once already (allowed, refused or "Not now"): never block on it again. */
  notificationsAsked: boolean;
  batterySeen: boolean;
}

/**
 * The next screen to show. Notifications are asked once but never block duty: without them only
 * the alert sound when the app is closed is lost, and Home says so.
 */
export function nextSetupStep(state: SetupState): SetupStep {
  if (!state.disclosureSeen) return "disclosure";
  if (state.location === "undetermined") return "location";
  if (state.location === "denied") return "location_denied";
  if (state.location === "approximate") return "precise";
  if (state.notifications === "undetermined" && !state.notificationsAsked) return "notifications";
  if (!state.batterySeen) return "battery";
  return "ready";
}

export type DutyEndReason = "CAPTAIN_OFF" | "LOCATION_STALE" | "PASS_EXPIRED" | "SUSPENDED" | "OPERATIONS";

/** Why the server ended duty, for Home. Nothing when the captain went off duty themselves. */
export function offDutyMessage(reason: string | null | undefined): string | null {
  switch (reason) {
    case "LOCATION_STALE":
      return "You went off duty: we lost your location for 2 minutes.";
    case "PASS_EXPIRED":
      return "You went off duty: your pass ended.";
    case "SUSPENDED":
    case "OPERATIONS":
      return "VSolve support took you off duty.";
    default:
      return null;
  }
}

/** Battery steps for the phone's maker, written from dontkillmyapp.com (brief §5.13). */
export function batterySteps(manufacturer: string | null | undefined): readonly string[] {
  const maker = (manufacturer ?? "").toLowerCase();
  if (maker.includes("xiaomi") || maker.includes("redmi") || maker.includes("poco")) {
    return [
      "Settings → Apps → Manage apps → V Solve Hub Partner → Battery saver → No restrictions.",
      "Settings → Apps → Permissions → Autostart → turn on V Solve Hub Partner.",
    ];
  }
  if (maker.includes("oppo") || maker.includes("realme") || maker.includes("oneplus")) {
    return [
      "Settings → Battery → App battery management → V Solve Hub Partner → Allow background activity.",
      "Settings → Apps → Auto launch (or Startup manager) → turn on V Solve Hub Partner.",
    ];
  }
  if (maker.includes("vivo")) {
    return [
      "Settings → Battery → Background power consumption → V Solve Hub Partner → Allow.",
      "i Manager → App manager → Autostart → turn on V Solve Hub Partner.",
    ];
  }
  if (maker.includes("samsung")) {
    return [
      "Settings → Apps → V Solve Hub Partner → Battery → Unrestricted.",
      "Settings → Battery → Background usage limits → make sure the app is not in Sleeping apps.",
    ];
  }
  return ["Settings → Apps → V Solve Hub Partner → Battery → Unrestricted (or Don't optimise)."];
}
