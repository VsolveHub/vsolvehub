import { useEffect, useMemo, useRef } from "react";
import MapView, { Marker, Polyline } from "react-native-maps";

import { decodePolyline, type LatLng } from "../polyline";
import type { Ride } from "../queries";

const ROUTE_BLUE = "#2563EB";

/**
 * Pickup, drop and the route, plus the captain's marker. The marker moves each time the ride is
 * checked again (every 3 s), because it comes from the server's last fresh ping.
 */
export function RideMap({ ride }: { ride: Ride }) {
  const mapRef = useRef<MapView>(null);
  const pickup = { latitude: Number(ride.pickup.latitude), longitude: Number(ride.pickup.longitude) };
  const drop = { latitude: Number(ride.drop.latitude), longitude: Number(ride.drop.longitude) };
  const route = useMemo(() => decodePolyline(ride.route_polyline), [ride.route_polyline]);
  const position = ride.captain?.position ?? null;
  const captain: LatLng | null = position ? { latitude: position.latitude, longitude: position.longitude } : null;
  const hasCaptain = captain !== null;

  // Frame the trip, and the captain once they appear. Not on every move, so the rider can pan.
  useEffect(() => {
    const points = [pickup, drop, ...(captain ? [captain] : [])];
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
    // Refit only when the captain appears or goes, not on every 3 s move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCaptain, ride.id]);

  return (
    <MapView
      ref={mapRef}
      style={{ height: 260, borderRadius: 16 }}
      userInterfaceStyle="light"
      initialRegion={{ ...pickup, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
    >
      <Marker coordinate={pickup} title="Pickup" pinColor="green" />
      <Marker coordinate={drop} title="Drop" pinColor="red" />
      {route.length > 1 ? <Polyline coordinates={route} strokeColor={ROUTE_BLUE} strokeWidth={4} /> : null}
      {captain ? <Marker coordinate={captain} title="Your captain" pinColor="blue" /> : null}
    </MapView>
  );
}
