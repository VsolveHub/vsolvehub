import * as Location from "expo-location";

import { mapLocationError, type CurrentPosition, type PositionError } from "./errors";

export async function getCurrentPosition(): Promise<CurrentPosition> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw mapLocationError({ code: "PERMISSION_DENIED" }) satisfies PositionError;
  }
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      },
      timestamp: position.timestamp,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "POSITION_UNAVAILABLE";
    throw mapLocationError({ code, message: code });
  }
}
