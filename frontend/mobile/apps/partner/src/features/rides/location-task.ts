/**
 * The captain's live location, sent every 5 seconds while on duty (Rides brief §5.13).
 *
 * The task is defined at module top level and this file is imported once from `app/_layout.tsx`,
 * so it exists even when Android starts the app's JavaScript without a screen. It runs without
 * React: no hooks, no queries, no navigation. It never restarts itself (Android forbids starting
 * a location service from the background); the screens start it, and stop it on the answers
 * below.
 */
import { isApiRequestError, request } from "@vsolve/api-client";
import { getApiClient, useAuthStore } from "@vsolve/mobile-core";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { clockOffset, inServerTime, saveClockOffset } from "./model/clock";

export const RIDES_LOCATION_TASK = "rides-location";

/** The exact options from the brief. `distanceInterval: 0` keeps a parked captain pinging. */
export const LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5000,
  distanceInterval: 0,
  deferredUpdatesInterval: 0,
  foregroundService: {
    notificationTitle: "You're on duty",
    notificationBody: "VSolve Rides is using your location to send you ride requests. Tap to open.",
    notificationColor: "#f87000",
    killServiceOnDestroy: false,
  },
};

export type PingOutcome = "sent" | "stopped" | "dropped" | "clock_refreshed";

/** At most one clock refresh a minute, however many stale answers arrive. */
const CLOCK_REFRESH_GAP_MS = 60_000;
let lastClockRefresh = 0;

export async function stopLocationTask(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RIDES_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDES_LOCATION_TASK);
    }
  } catch {
    // Already stopped, or the task was never registered: nothing to stop.
  }
}

/** The newest of the readings Android delivered together. */
export function newestLocation(
  locations: readonly Location.LocationObject[],
): Location.LocationObject | null {
  return locations.reduce<Location.LocationObject | null>(
    (newest, location) => (newest === null || location.timestamp > newest.timestamp ? location : newest),
    null,
  );
}

async function refreshClock(): Promise<void> {
  const now = Date.now();
  if (now - lastClockRefresh < CLOCK_REFRESH_GAP_MS) return;
  lastClockRefresh = now;
  const me = await request(() => getApiClient().GET("/api/v1/partner/rides/me/"));
  await saveClockOffset(me.server_now);
}

/**
 * Send the newest reading. No queue and no retry: a dropped ping is replaced 5 seconds later,
 * and a ping older than 30 s is useless anyway.
 */
export async function sendNewestPing(locations: readonly Location.LocationObject[]): Promise<PingOutcome> {
  // A request without a token answers "not signed in", and the client then signs the captain
  // out. So the token is read first, and without one the task stops instead.
  if (!useAuthStore.getState().token) await useAuthStore.getState().hydrate();
  if (!useAuthStore.getState().token) {
    await stopLocationTask();
    return "stopped";
  }

  const location = newestLocation(locations);
  const accuracy = location?.coords.accuracy ?? 0;
  if (location === null || !(accuracy > 0)) return "dropped";
  const heading = location.coords.heading;
  const capturedAt = inServerTime(location.timestamp, await clockOffset());

  try {
    await request(() =>
      getApiClient().POST("/api/v1/partner/rides/location/", {
        body: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy_m: accuracy,
          heading: heading !== null && heading >= 0 && heading <= 360 ? heading : null,
          captured_at: capturedAt,
        },
      }),
    );
    return "sent";
  } catch (error) {
    if (!isApiRequestError(error)) return "dropped"; // no signal: the next ping comes in 5 s
    if (error.code === "not_on_duty" || error.code === "not_authenticated" || error.code === "session_expired" || error.status === 401) {
      // The server ended duty (pass, no pings, Operations), or the session really ended.
      await stopLocationTask();
      return "stopped";
    }
    if (error.code === "location_stale") {
      try {
        await refreshClock();
        return "clock_refreshed";
      } catch {
        return "dropped";
      }
    }
    return "dropped"; // location_unavailable (Redis down) and anything else: carry on
  }
}

/** Tests only. */
export function resetLocationTaskForTests(): void {
  lastClockRefresh = 0;
}

// Phones only: the partner website has no background tasks.
if (Platform.OS !== "web") {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(RIDES_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    await sendNewestPing(data.locations ?? []);
  });
}
