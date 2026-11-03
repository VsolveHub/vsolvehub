import { Check, X } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

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
            : "#e5e7eb";

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
                <View
                  style={[
                    styles.verticalLine,
                    { backgroundColor: lineActiveColor },
                  ]}
                />
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 22,
    flexDirection: "column",
  },
  nodeRow: {
    flexDirection: "row",
  },
  leftColumn: {
    alignItems: "center",
    width: 28,
    marginRight: 14,
  },
  circleBase: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  circleCompleted: {
    backgroundColor: "#2fa84f",
  },
  circleActiveBlue: {
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#2563eb",
  },
  circleActiveOrange: {
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#f26a0f",
  },
  circleRejected: {
    backgroundColor: "#d32f1e",
  },
  circlePending: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#cbd5e1",
  },
  verticalLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  rightColumn: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  nodeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0b1b3a",
  },
  nodeSubtitle: {
    fontSize: 13.5,
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 19,
  },
});
