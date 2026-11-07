// Ported from frontend/apps/customer/features/bookings/view/visit-progress.tsx
import type { Schemas } from "@vsolve/api-client";
import { Text } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";

type VisitStatus = Schemas["BookingStatusEnum"];

const STEPS = ["On the way", "Arrived", "In progress"] as const;

function reachedStep(status: VisitStatus): number | null {
  switch (status) {
    case "CONFIRMED":
      return 0;
    case "EN_ROUTE":
      return 1;
    case "ARRIVED":
      return 2;
    case "IN_PROGRESS":
      return 3;
    default:
      return null;
  }
}

/** The current step breathes, so the screen reads as live. Stops itself on unmount. */
function PulseDot() {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.7, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return <Animated.View className="size-2 rounded-full bg-success" style={{ transform: [{ scale }] }} />;
}

export function VisitProgress({ status }: { status: VisitStatus }) {
  const reached = reachedStep(status);
  if (reached === null) return null;

  return (
    <View className="rounded-card bg-surface-sunken p-4">
      <Text className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-text-muted">
        Visit status
      </Text>
      <View className="mt-3 flex-row items-start">
        {STEPS.map((label, index) => {
          const isDone = index < reached - 1;
          const isCurrent = index === reached - 1;
          const isReached = index < reached;
          return (
            <View key={label} className="flex-1 items-center">
              <View className="w-full flex-row items-center">
                <View className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : isReached ? "bg-success" : "bg-line"}`} />
                <View
                  className={`size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-success bg-success"
                      : isCurrent
                        ? "border-success bg-surface"
                        : "border-line bg-surface"
                  }`}
                >
                  {isDone ? <Text className="text-[10px] text-text-inverse">✓</Text> : null}
                  {isCurrent ? <PulseDot /> : null}
                </View>
                <View
                  className={`h-0.5 flex-1 ${
                    index === STEPS.length - 1 ? "bg-transparent" : index < reached - 1 ? "bg-success" : "bg-line"
                  }`}
                />
              </View>
              <Text className={`mt-2 text-center text-xs ${isReached ? "font-semibold text-text" : "text-text-muted"}`}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
