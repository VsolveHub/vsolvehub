// Ported from frontend/apps/customer/features/bookings/view/visit-progress.tsx
import type { Schemas } from "@vsolve/api-client";
import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

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
                  {isCurrent ? <View className="size-2 rounded-full bg-success" /> : null}
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
