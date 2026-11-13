/**
 * What this phone has already done for duty (brief §5.13): read by Home, to go on duty at once when
 * nothing is missing, and by the duty setup screen, to show only what is.
 */
import { kvGet, pushPermission } from "@vsolve/mobile-core";
import * as Location from "expo-location";

import { locationAccess, type SetupState } from "./model/duty-setup";

export const DISCLOSURE_SEEN = "rides.disclosureSeen";
export const NOTIFICATIONS_ASKED = "rides.notificationsAsked";
export const BATTERY_SEEN = "rides.batterySeen";

export async function readSetup(): Promise<SetupState> {
  const [disclosure, asked, battery, permission, push] = await Promise.all([
    kvGet(DISCLOSURE_SEEN),
    kvGet(NOTIFICATIONS_ASKED),
    kvGet(BATTERY_SEEN),
    Location.getForegroundPermissionsAsync(),
    pushPermission(),
  ]);
  return {
    disclosureSeen: disclosure === "1",
    notificationsAsked: asked === "1",
    batterySeen: battery === "1",
    location: locationAccess(permission),
    notifications: push,
  };
}
