// Ported from frontend/packages/ui/src/stepper.tsx
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

interface StepperProps {
  steps: { id: string; title: string }[];
  current: number;
  label?: string;
}

export function Stepper({ steps, current, label = "Progress" }: StepperProps) {
  return (
    <View accessibilityLabel={label} className="flex-row items-center gap-2">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={step.id} accessibilityState={{ selected: active }} className="flex-1 flex-row items-center gap-2">
            <View
              className={cn(
                "h-8 w-8 items-center justify-center rounded-full",
                done || active ? "bg-action-secondary" : "bg-surface-sunken",
              )}
            >
              <Text className={cn("text-sm font-semibold", done || active ? "text-action-secondary-text" : "text-text-secondary")}>
                {done ? "✓" : index + 1}
              </Text>
            </View>
            <Text className="sr-only">
              {`Step ${index + 1} of ${steps.length}: ${step.title}${done ? ", completed" : active ? ", current step" : ""}`}
            </Text>
            {index < steps.length - 1 ? (
              <View className={cn("h-px flex-1", done ? "bg-action-secondary" : "bg-line")} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
