import { Text } from "@vsolve/mobile-ui";
import { StyleSheet, View } from "react-native";

import { describeAreaDistance, distanceKm, type Point } from "@/features/work/model/area";

/**
 * Web fallback for VisitAreaMap: renders an area summary badge and placeholder
 * instead of native MapView (which requires iOS/Android native binaries).
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
  const distance = describeAreaDistance(distanceKm(partner, center));

  return (
    <View
      accessibilityLabel={`Map of ${area}. ${distance}. The exact address unlocks later.`}
      style={[StyleSheet.absoluteFill, styles.container, { paddingBottom: bottomInset + 32 }]}
    >
      <View style={styles.card}>
        <Text numberOfLines={1} style={styles.areaTitle}>
          {area}
        </Text>
        <Text numberOfLines={1} style={styles.distanceSubtitle}>
          {distance}
        </Text>
        <Text style={styles.webNote}>Map preview available on mobile app</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  areaTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  distanceSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  webNote: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 8,
  },
});
