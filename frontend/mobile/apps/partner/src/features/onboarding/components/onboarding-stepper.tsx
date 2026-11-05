import { Text } from "@vsolve/mobile-ui";
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

export interface OnboardingStepperProps {
  currentStep: number; // 0-based: 0 (Step 1), 1 (Step 2), 2 (Step 3), 3 (Step 4)
  totalSteps?: number;
  stepLabel: string;
  variant?: "circles" | "segmented";
}

export function OnboardingStepper({
  currentStep,
  totalSteps = 4,
  stepLabel,
  variant = "segmented",
}: OnboardingStepperProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i);

  return (
    <View style={styles.container}>
      {variant === "circles" ? (
        <View style={styles.circlesRow}>
          {steps.map((stepIndex) => {
            const isCompleted = stepIndex < currentStep;
            const isCurrent = stepIndex === currentStep;
            const isActive = isCompleted || isCurrent;

            return (
              <View key={stepIndex} style={styles.circleStepWrapper}>
                {/* Connecting Line Left (if not first) */}
                {stepIndex > 0 ? (
                  <View
                    style={[
                      styles.connectingLine,
                      { backgroundColor: stepIndex <= currentStep ? "#f87000" : "#e5e7eb" },
                    ]}
                  />
                ) : null}

                {/* Circle Badge */}
                <View
                  style={[
                    styles.circleNode,
                    isActive ? styles.circleNodeActive : styles.circleNodeInactive,
                  ]}
                >
                  {isCompleted ? (
                    <Check size={14} color="#ffffff" strokeWidth={3} />
                  ) : (
                    <Text
                      style={[
                        styles.circleNodeText,
                        isActive ? styles.circleNodeTextActive : styles.circleNodeTextInactive,
                      ]}
                    >
                      {stepIndex + 1}
                    </Text>
                  )}
                </View>

                {/* Connecting Line Right (if not last) */}
                {stepIndex < totalSteps - 1 ? (
                  <View
                    style={[
                      styles.connectingLine,
                      { backgroundColor: stepIndex < currentStep ? "#f87000" : "#e5e7eb" },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        /* Segmented 4-Pill Bar Variant (Matching Design Spec) */
        <View style={styles.segmentedRow}>
          {steps.map((stepIndex) => (
            <View
              key={stepIndex}
              style={[
                styles.segmentBar,
                {
                  backgroundColor: stepIndex <= currentStep ? "#f87000" : "#d1d5db",
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Step Caption (e.g. Step 1 of 4 · About you) */}
      <View style={styles.captionRow}>
        <Text style={styles.captionText}>
          Step {currentStep + 1} of {totalSteps} · {stepLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  circlesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  circleStepWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  connectingLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  circleNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  circleNodeActive: {
    backgroundColor: "#f87000",
  },
  circleNodeInactive: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  circleNodeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  circleNodeTextActive: {
    color: "#ffffff",
  },
  circleNodeTextInactive: {
    color: "#6b7280",
  },
  segmentedRow: {
    flexDirection: "row",
    columnGap: 8,
    width: "100%",
    marginBottom: 6,
  },
  segmentBar: {
    flex: 1,
    height: 5,
    borderRadius: 9999,
  },
  captionRow: {
    marginTop: 6,
  },
  captionText: {
    fontSize: 13.5,
    color: "#64748b",
    fontWeight: "500",
  },
});
