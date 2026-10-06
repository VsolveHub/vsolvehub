// Ported from frontend/packages/ui/src/quantity-stepper.tsx
import { useId } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface QuantityStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  decrementLabel: string;
  incrementLabel: string;
  hint?: string;
  disabled?: boolean;
  unit?: string;
  className?: string;
}

export function QuantityStepper({
  label,
  value,
  onChange,
  min = 1,
  max,
  decrementLabel,
  incrementLabel,
  hint,
  disabled = false,
  unit,
  className,
}: QuantityStepperProps) {
  const labelId = useId();
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <View className={cn("gap-1.5", className)}>
      <View className="flex-row items-center justify-between gap-4">
        <Text nativeID={labelId} className="text-sm font-semibold text-text">
          {label}
        </Text>
        <View accessibilityRole="none" accessibilityLabel={label} className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={decrementLabel}
            disabled={disabled || atMin}
            onPress={() => onChange(Math.max(min, value - 1))}
            className="h-11 w-11 items-center justify-center rounded-control border border-line-strong bg-surface"
          >
            <Text className="text-lg text-text">−</Text>
          </Pressable>
          <Text
            accessibilityLiveRegion="polite"
            className="min-w-10 text-center text-base font-bold tabular-nums text-text"
          >
            {unit ? `${value} ${unit}` : String(value)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={incrementLabel}
            disabled={disabled || atMax}
            onPress={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
            className="h-11 w-11 items-center justify-center rounded-control border border-line-strong bg-surface"
          >
            <Text className="text-lg text-text">+</Text>
          </Pressable>
        </View>
      </View>
      {hint ? <Text className="text-sm text-text-secondary">{hint}</Text> : null}
    </View>
  );
}
