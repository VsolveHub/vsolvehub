import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { StyleSheet, View } from "react-native";

import { describeRoute, type VisitRoute } from "@/features/work/route";

export { describeRoute };

/**
 * Web fallback for VisitRouteMap: renders route summary details
 * instead of native MapView (which requires iOS/Android native binaries).
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
  const routeDescription = describeRoute(route);

  return (
    <View
      accessibilityLabel={`Route to the customer, ${routeDescription}`}
      style={[StyleSheet.absoluteFill, styles.container, { paddingTop: topInset, paddingBottom: bottomInset + 24 }]}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Route to Customer</Text>
        <Text style={styles.subtitle}>{routeDescription}</Text>
        <Text style={styles.webNote}>Turn-by-turn map navigation is available on mobile app</Text>
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
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLOR_TOKENS.action,
    marginTop: 4,
  },
  webNote: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 8,
  },
});
