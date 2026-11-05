import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient, getCurrentPosition } from "@vsolve/mobile-core";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import type { PartnerVisit } from "./queries";

/**
 * The road route from the Partner to the visit, for the job screen's map (contract 1.96.0).
 *
 * Django computes it with the server's Maps key and sends back the line, the distance and the
 * time; the app never holds a routing key. The line ends at the Customer's pin, so the map puts
 * the destination marker on the line's last point — the pin itself is never sent on its own.
 */

export type VisitRoute = Schemas["PartnerVisitRoute"];

export interface LatLng {
  readonly latitude: number;
  readonly longitude: number;
}

/** Where to re-ask from as the Partner moves, and how often. */
const POSITION_EVERY_MS = 30_000;
const ROUTE_EVERY_MS = 60_000;

/**
 * Whether this build can draw the map. iOS draws Apple Maps with no key; Android needs the Maps
 * key baked in at build time, and without it would show an empty grey square.
 */
export function isInAppMapAvailable(): boolean {
  if (Platform.OS === "ios") return true;
  if (Platform.OS !== "android") return false;
  const extra = Constants.expoConfig?.extra as { mapsEnabled?: unknown } | undefined;
  return extra?.mapsEnabled === true;
}

/** A visit whose address is the Partner's to see, and which is still worth driving to. */
export function isRoutable(visit: PartnerVisit): boolean {
  return (
    visit.site_address !== null &&
    (visit.status === "CONFIRMED" || visit.status === "EN_ROUTE" || visit.status === "ARRIVED")
  );
}

/** The Partner's position, refreshed every half minute while the app is on screen. No prompt. */
export function usePartnerPosition(enabled: boolean): LatLng | null {
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const read = () => {
      if (AppState.currentState !== "active") return;
      void getCurrentPosition({ prompt: false, maxAgeMs: POSITION_EVERY_MS })
        .then((fix) => {
          if (!cancelled) setPosition({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
        })
        .catch(() => {
          // No position, no route: the Navigate button still works without one.
        });
    };
    read();
    const timer = setInterval(read, POSITION_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return position;
}

/** ~110 m: moving less than this does not need a new route. */
function rounded(value: number): string {
  return value.toFixed(3);
}

export function useVisitRoute(visit: PartnerVisit, origin: LatLng | null) {
  const enabled = origin !== null && isRoutable(visit);
  return useQuery({
    queryKey: [
      "partner-work",
      "visit-route",
      visit.id,
      origin === null ? null : `${rounded(origin.latitude)},${rounded(origin.longitude)}`,
    ],
    queryFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/partner/bookings/{booking_id}/route/", {
          params: { path: { booking_id: visit.id } },
          body: { latitude: origin!.latitude.toFixed(6), longitude: origin!.longitude.toFixed(6) },
        }),
      ),
    enabled,
    staleTime: ROUTE_EVERY_MS,
    refetchInterval: ROUTE_EVERY_MS,
    // A missing route is not worth hammering: the screen falls back to the Navigate button.
    retry: 1,
  });
}

/** Google's encoded-polyline format, decoded to points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    latitude += next();
    longitude += next();
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export function describeRoute(route: Pick<VisitRoute, "distance_meters" | "duration_seconds">): string {
  const minutes = Math.max(1, Math.round(route.duration_seconds / 60));
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
  const distance =
    route.distance_meters < 1000
      ? `${route.distance_meters} m`
      : `${(route.distance_meters / 1000).toFixed(route.distance_meters < 10_000 ? 1 : 0)} km`;
  return `${time} · ${distance}`;
}
