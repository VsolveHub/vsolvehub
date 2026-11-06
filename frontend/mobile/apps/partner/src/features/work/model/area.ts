/**
 * Placing a visit's *area* on the map before its address unlocks.
 *
 * All the Partner has at this stage is the area's name, such as "Financial District". A name like
 * that exists in many cities, so a looked-up point is only believed when it is close to the Partner.
 * A wrong circle on a map is worse than no map: the screen falls back to the countdown instead.
 */

export interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

/** A job further than this from the Partner means the lookup found the wrong place. */
export const MAX_AREA_DISTANCE_KM = 100;

/** Big on purpose: this marks a neighbourhood, never a door. */
export const AREA_RADIUS_METERS = 1200;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance between two points. */
export function distanceKm(a: Point, b: Point): number {
  const latitude = toRadians(b.latitude - a.latitude);
  const longitude = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The looked-up point closest to the Partner, or `null` when none is believable. */
export function nearestBelievable(candidates: readonly Point[], near: Point, maxKm = MAX_AREA_DISTANCE_KM): Point | null {
  let best: Point | null = null;
  let bestKm = maxKm;
  for (const candidate of candidates) {
    const km = distanceKm(candidate, near);
    if (km <= bestKm) {
      best = candidate;
      bestKm = km;
    }
  }
  return best;
}

/** The circle's north, south, east and west edges, so the camera can fit all of it. */
export function circleEdges(center: Point, radiusMeters = AREA_RADIUS_METERS): Point[] {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(0.01, Math.cos(toRadians(center.latitude))));
  return [
    { latitude: center.latitude + latitudeDelta, longitude: center.longitude },
    { latitude: center.latitude - latitudeDelta, longitude: center.longitude },
    { latitude: center.latitude, longitude: center.longitude + longitudeDelta },
    { latitude: center.latitude, longitude: center.longitude - longitudeDelta },
  ];
}

/** How far the area is, worded as the estimate it is. */
export function describeAreaDistance(km: number): string {
  if (km < 1) return "Under 1 km away";
  return `About ${Math.round(km)} km away`;
}
