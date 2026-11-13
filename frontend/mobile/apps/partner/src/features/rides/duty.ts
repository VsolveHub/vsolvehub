/**
 * Going on and off duty, in the order the brief sets (§5.13), so the server is never left on
 * duty while the phone sends nothing.
 */
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import * as Location from "expo-location";

import { LOCATION_OPTIONS, RIDES_LOCATION_TASK, stopLocationTask } from "./location-task";
import { saveClockOffset } from "./model/clock";

export const START_FAILED_MESSAGE = "Couldn't start location. Try again.";

async function serverStop(): Promise<void> {
  try {
    await request(() => getApiClient().POST("/api/v1/partner/rides/duty/stop/"));
  } catch {
    // The 2-minute no-ping rule on the server ends duty anyway.
  }
}

async function isRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(RIDES_LOCATION_TASK);
  } catch {
    return false;
  }
}

/** Whether the phone's own location switch (quick settings) is on. Unknown counts as on. */
export async function locationSwitchOn(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

/**
 * Ask the phone to turn its location switch on, the way a ride app does: Android's own pop-up
 * ("Turn on device location?") and one tap on OK. Declining, or no pop-up, changes nothing: the
 * caller looks at the switch again and says what is needed.
 */
export async function turnOnLocation(): Promise<void> {
  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    // Declined (or Android could not show it).
  }
}

/**
 * 1. The server puts the captain on duty (or refuses, with the reason).
 * 2. The clock offset is saved from its `server_now`.
 * 3. The location service starts. If it cannot, duty is stopped again at once.
 * Must run while the app is on screen: Android forbids starting the service from the background.
 */
export async function goOnDuty(): Promise<void> {
  const status = await request(() => getApiClient().POST("/api/v1/partner/rides/duty/start/"));
  await saveClockOffset(status.server_now);
  try {
    await Location.startLocationUpdatesAsync(RIDES_LOCATION_TASK, LOCATION_OPTIONS);
  } catch {
    await serverStop();
    throw new Error(START_FAILED_MESSAGE);
  }
}

/** Stop the phone first, then the server; if the server call fails, its no-ping rule finishes it. */
export async function goOffDuty(): Promise<void> {
  await stopLocationTask();
  await request(() => getApiClient().POST("/api/v1/partner/rides/duty/stop/"));
}

export type ReconcileResult = "in_sync" | "restarted" | "stopped";

/**
 * Run whenever the app opens or comes to the front: make the phone match the server.
 * - Server on duty, phone not sending (phone restarted, service killed): start it again, since
 *   the app is on screen. If that fails, take the server off duty rather than leave it silent.
 * - Server off duty, phone still sending: stop the phone. The app then says why, from
 *   `last_duty_end`.
 */
export async function reconcileDuty(serverOnDuty: boolean): Promise<ReconcileResult> {
  const running = await isRunning();
  if (serverOnDuty && !running) {
    try {
      await Location.startLocationUpdatesAsync(RIDES_LOCATION_TASK, LOCATION_OPTIONS);
      return "restarted";
    } catch {
      await serverStop();
      return "stopped";
    }
  }
  if (!serverOnDuty && running) {
    await stopLocationTask();
    return "stopped";
  }
  return "in_sync";
}
