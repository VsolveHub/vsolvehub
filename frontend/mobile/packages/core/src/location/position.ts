import * as Location from "expo-location";

import {
  mapLocationError,
  SERVICES_DISABLED,
  TIMEOUT,
  type CurrentPosition,
  type PositionError,
} from "./errors";

export interface PositionOptions {
  /**
   * Ask for permission when the person has not answered yet. Off for background refreshes, which
   * must never put a permission prompt in front of somebody who did not tap anything.
   */
  readonly prompt?: boolean;
  /** A fix this recent is good enough, and returns at once instead of waiting for the GPS. */
  readonly maxAgeMs?: number;
  /** Give up after this long rather than leaving a spinner turning with no end. */
  readonly timeoutMs?: number;
}

/** Whether this app may read the location right now, without asking. */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).status === "granted";
  } catch {
    return false;
  }
}

function toPosition(position: Location.LocationObject): CurrentPosition {
  return {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    },
    timestamp: position.timestamp,
  };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject({ code: TIMEOUT, message: "Location request timed out." } satisfies PositionError),
      timeoutMs,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The phone's position, or a `PositionError` saying why not.
 *
 * Three things used to make "Go online" hang with nothing on screen: asking the GPS for a fresh
 * fix indoors (which can take a minute or never come), a phone with location switched off (which
 * Expo reports as a generic failure), and no time limit on either. A recent fix now answers at
 * once, location being off is its own error, and the GPS gets `timeoutMs` and no longer.
 */
export async function getCurrentPosition(options: PositionOptions = {}): Promise<CurrentPosition> {
  const { prompt = true, maxAgeMs = 60_000, timeoutMs = 15_000 } = options;
  const existing = await Location.getForegroundPermissionsAsync();
  const permission =
    existing.status === "granted" || !prompt ? existing : await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw mapLocationError({ code: "PERMISSION_DENIED" }) satisfies PositionError;
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw {
      code: SERVICES_DISABLED,
      message: "Location is turned off on this phone.",
    } satisfies PositionError;
  }
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: maxAgeMs,
    requiredAccuracy: 500,
  }).catch(() => null);
  if (recent !== null) return toPosition(recent);
  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutMs,
    );
    return toPosition(position);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === TIMEOUT) {
      throw error;
    }
    const code = error instanceof Error ? error.message : "POSITION_UNAVAILABLE";
    throw mapLocationError({ code, message: code });
  }
}
