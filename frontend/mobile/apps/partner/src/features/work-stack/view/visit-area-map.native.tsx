import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { useCallback, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";

import { AREA_RADIUS_METERS, circleEdges, describeAreaDistance, distanceKm, type Point } from "@/features/work/model/area";

/**
 * The map before the address unlocks: the Partner's dot and a wide circle around the neighbourhood.
 *
 * It answers "how far is this job?" and gives nothing else away. The circle is drawn from the area
 * name the Partner can already read, not from the Customer's pin, which stays on the server.
 */
export function VisitAreaMap({
  area,
  center,
  partner,
  bottomInset,
}: {
  readonly area: string;
  readonly center: Point;
  readonly partner: Point;
  readonly bottomInset: number;
}) {
  const mapRef = useRef<MapView>(null);
  const points = useMemo(() => [partner, ...circleEdges(center)], [partner, center]);
  const distance = describeAreaDistance(distanceKm(partner, center));

  const fit = useCallback(() => {
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 96, right: 48, bottom: bottomInset + 32, left: 48 },
      animated: true,
    });
  }, [points, bottomInset]);

  return (
    <MapView
      ref={mapRef}
      accessibilityLabel={`Map of ${area}. ${distance}. The exact address unlocks later.`}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      style={[StyleSheet.absoluteFill, { backgroundColor: "#ffffff" }]}
      loadingBackgroundColor="#ffffff"
      loadingIndicatorColor={COLOR_TOKENS.action}
      initialRegion={{ latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
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
      <Circle center={center} radius={AREA_RADIUS_METERS} fillColor={`${COLOR_TOKENS.action}2E`} strokeColor={COLOR_TOKENS.action} strokeWidth={2} />
      <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
        <View className="items-center rounded-2xl bg-surface px-3 py-1.5 shadow-md">
          <Text numberOfLines={1} className="text-sm font-extrabold text-text">{area}</Text>
          <Text numberOfLines={1} className="text-[0.6875rem] font-semibold text-text-secondary">{distance}</Text>
        </View>
      </Marker>
    </MapView>
  );
}
