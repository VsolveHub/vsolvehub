import { COLOR_TOKENS } from "@vsolve/mobile-ui";
import { useCallback, useMemo, useRef } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";

import { decodePolyline, describeRoute, type VisitRoute } from "@/features/work/route";

export { describeRoute };

/**
 * The map that fills the whole job screen: the Partner's dot, the road route and the Customer's pin.
 *
 * `bottomInset` is how much of the bottom the sheet covers, so the route is fitted into the part
 * of the map that can be seen. It shows the way; it does not navigate. Turn-by-turn voice
 * directions are the Google Maps app's job, one tap away on the Navigate button. The pin is the
 * route's last point: Django does not publish the Customer's coordinates on their own.
 */
export function VisitRouteMap({
  route,
  bottomInset,
  topInset,
}: {
  readonly route: VisitRoute;
  readonly bottomInset: number;
  readonly topInset: number;
}) {
  const points = useMemo(() => decodePolyline(route.encoded_polyline), [route.encoded_polyline]);
  const destination = points.length > 0 ? points[points.length - 1]! : null;
  const mapRef = useRef<MapView>(null);

  const fit = useCallback(() => {
    if (points.length > 1) {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: topInset + 72, right: 48, bottom: bottomInset + 24, left: 48 },
        animated: true,
      });
    }
  }, [points, bottomInset, topInset]);

  if (destination === null) return null;

  return (
    <MapView
      ref={mapRef}
      accessibilityLabel={`Route to the customer, ${describeRoute(route)}`}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      style={[StyleSheet.absoluteFill, { backgroundColor: "#ffffff" }]}
      loadingBackgroundColor="#ffffff"
      loadingIndicatorColor={COLOR_TOKENS.action}
      initialRegion={{
        latitude: destination.latitude,
        longitude: destination.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }}
      onMapReady={fit}
      onLayout={fit}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      loadingEnabled
    >
      <Polyline coordinates={points} strokeColor={COLOR_TOKENS.actionSecondary} strokeWidth={6} lineCap="round" lineJoin="round" />
      <Marker coordinate={destination} pinColor={COLOR_TOKENS.action} title="Customer" />
    </MapView>
  );
}
