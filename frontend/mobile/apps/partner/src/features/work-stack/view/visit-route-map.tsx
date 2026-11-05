import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { useCallback, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";

import { decodePolyline, describeRoute, type VisitRoute } from "@/features/work/route";

const EDGE = { top: 56, right: 40, bottom: 40, left: 40 };

/**
 * The rider-style map on the job screen: the Partner's dot, the road route and the Customer's pin,
 * with the time and distance on top.
 *
 * It shows the way; it does not navigate. Turn-by-turn voice directions are the Google Maps app's
 * job, one tap away on the Navigate button beside it. The pin is the route's last point — Django
 * does not publish the Customer's coordinates on their own.
 */
export function VisitRouteMap({ route }: { readonly route: VisitRoute }) {
  const points = useMemo(() => decodePolyline(route.encoded_polyline), [route.encoded_polyline]);
  const destination = points.length > 0 ? points[points.length - 1]! : null;
  const mapRef = useRef<MapView>(null);

  const fit = useCallback(() => {
    if (points.length > 1) mapRef.current?.fitToCoordinates(points, { edgePadding: EDGE, animated: false });
  }, [points]);

  if (destination === null) return null;

  return (
    <View accessibilityLabel={`Route to the customer, ${describeRoute(route)}`} className="overflow-hidden rounded-card border border-line">
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        style={{ height: 240, width: "100%" }}
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
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        loadingEnabled
      >
        <Polyline coordinates={points} strokeColor={COLOR_TOKENS.actionSecondary} strokeWidth={5} />
        <Marker coordinate={destination} pinColor={COLOR_TOKENS.action} title="Customer" />
      </MapView>
      <View className="absolute left-3 top-3 rounded-full border border-line bg-surface px-3 py-1.5">
        <Text className="text-sm font-extrabold text-text">{describeRoute(route)}</Text>
      </View>
    </View>
  );
}
