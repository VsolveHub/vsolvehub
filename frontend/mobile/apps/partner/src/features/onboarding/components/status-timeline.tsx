import { Text } from "@vsolve/mobile-ui";
import { Check, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View } from "react-native";

export type TimelineNodeState =
  | "completed" // green filled with checkmark
  | "active-blue" // blue ring
  | "active-orange" // orange ring
  | "rejected" // red filled with cross
  | "pending"; // gray ring

export interface TimelineNode {
  title: string;
  subtitle: string;
  state: TimelineNodeState;
  connectorColors?: [string, string] | string;
}

export interface StatusTimelineProps {
  nodes: TimelineNode[];
}

export function StatusTimeline({ nodes }: StatusTimelineProps) {
  return (
    <View style={styles.card}>
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        const lineActiveColor =
          node.state === "completed"
            ? "#2fa84f"
            : node.state === "active-orange"
            ? "#f26a0f"
            : node.state === "rejected"
            ? "#d32f1e"
            : "#e2e8f0";

        return (
          <View key={index} style={styles.nodeRow}>
            {/* Left column: Node icon + vertical connecting line */}
            <View style={styles.leftColumn}>
              {/* Node Icon */}
              {node.state === "completed" ? (
                <View style={[styles.circleBase, styles.circleCompleted]}>
                  <Check size={14} color="#ffffff" strokeWidth={3} />
                </View>
              ) : node.state === "active-blue" ? (
                <View style={[styles.circleBase, styles.circleActiveBlue]} />
              ) : node.state === "active-orange" ? (
                <View style={[styles.circleBase, styles.circleActiveOrange]} />
              ) : node.state === "rejected" ? (
                <View style={[styles.circleBase, styles.circleRejected]}>
                  <X size={14} color="#ffffff" strokeWidth={3} />
                </View>
              ) : (
                <View style={[styles.circleBase, styles.circlePending]} />
              )}

              {/* Vertical line between nodes */}
              {!isLast ? (
                Array.isArray(node.connectorColors) ? (
                  <LinearGradient
                    colors={node.connectorColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.verticalLine}
                  />
                ) : (
                  <View
                    style={[
                      styles.verticalLine,
                      {
                        backgroundColor:
                          typeof node.connectorColors === "string"
                            ? node.connectorColors
                            : lineActiveColor,
                      },
                    ]}
                  />
                )
              ) : null}
            </View>

            {/* Right column: Title & Subtitle */}
            <View style={[styles.rightColumn, !isLast ? { paddingBottom: 28 } : null]}>
              <Text style={styles.nodeTitle}>{node.title}</Text>
              <Text style={styles.nodeSubtitle}>{node.subtitle}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 22,
    flexDirection: "column",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 8px rgba(7, 19, 40, 0.04)",
        } as any)
      : {
          elevation: 2,
          shadowColor: "#071328",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        }),
  },
  nodeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  leftColumn: {
    width: 28,
    alignItems: "center",
    marginRight: 16,
    position: "relative",
  },
  circleBase: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    backgroundColor: "#ffffff",
  },
  circleCompleted: {
    backgroundColor: "#2fa84f",
  },
  circleActiveBlue: {
    borderWidth: 3,
    borderColor: "#2563eb",
  },
  circleActiveOrange: {
    borderWidth: 3,
    borderColor: "#f26a0f",
  },
  circleRejected: {
    backgroundColor: "#ef4444",
  },
  circlePending: {
    borderWidth: 2,
    borderColor: "#cbd5e1",
  },
  verticalLine: {
    position: "absolute",
    top: 26,
    bottom: -4,
    width: 2.5,
    zIndex: 1,
  },
  rightColumn: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    paddingTop: 1.5,
  },
  nodeTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#071328",
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  nodeSubtitle: {
    fontSize: 13.5,
    color: "#64748b",
    lineHeight: 18,
    fontWeight: "400",
  },
});
