export const PERMISSION_DENIED = 1;
export const POSITION_UNAVAILABLE = 2;
export const TIMEOUT = 3;

export interface CurrentPosition {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
}

export interface PositionError {
  code: number;
  message: string;
}

/** Maps Expo's location failures onto the same codes the web geolocation API uses. */
export function mapLocationError(error: { code?: string; message?: string }): PositionError {
  const code = error.code ?? "";
  if (code.includes("PERMISSION") || code === "E_LOCATION_UNAUTHORIZED") {
    return { code: PERMISSION_DENIED, message: "Location permission was denied." };
  }
  if (code.includes("TIMEOUT")) {
    return { code: TIMEOUT, message: "Location request timed out." };
  }
  return {
    code: POSITION_UNAVAILABLE,
    message: error.message ?? "Location is unavailable.",
  };
}
