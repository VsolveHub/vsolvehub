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
  hideLabel?: boolean;
  size?: "sm" | "md";
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
  hideLabel = false,
  size = "md",
}: QuantityStepperProps) {
  const labelId = useId();
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const isSm = size === "sm";

  return (
    <View className={cn("gap-1.5", className)}>
      <View
        className={cn(
          "flex-row items-center",
          hideLabel ? "justify-end" : "justify-between gap-3",
        )}
      >
        {!hideLabel && label ? (
          <Text nativeID={labelId} className="flex-1 text-sm font-semibold text-text">
            {label}
          </Text>
        ) : null}
        <View
          accessibilityRole="none"
          accessibilityLabel={label}
          className="flex-row items-center gap-1"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={decrementLabel}
            disabled={disabled || atMin}
            onPress={() => onChange(Math.max(min, value - 1))}
            className={cn(
              "items-center justify-center rounded-control border border-line-strong bg-surface active:bg-surface-hover",
              isSm ? "h-9 w-9" : "h-10 w-10",
              (disabled || atMin) && "opacity-40",
            )}
          >
            <Text className={cn("text-text font-bold", isSm ? "text-base" : "text-lg")}>−</Text>
          </Pressable>
          <Text
            accessibilityLiveRegion="polite"
            className={cn(
              "text-center font-bold tabular-nums text-text",
              isSm ? "min-w-8 text-sm" : "min-w-9 text-base",
            )}
          >
            {unit ? `${value} ${unit}` : String(value)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={incrementLabel}
            disabled={disabled || atMax}
            onPress={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
            className={cn(
              "items-center justify-center rounded-control border border-line-strong bg-surface active:bg-surface-hover",
              isSm ? "h-9 w-9" : "h-10 w-10",
              (disabled || atMax) && "opacity-40",
            )}
          >
            <Text className={cn("text-text font-bold", isSm ? "text-base" : "text-lg")}>+</Text>
          </Pressable>
        </View>
      </View>
      {hint ? <Text className="text-sm text-text-secondary">{hint}</Text> : null}
    </View>
  );
}
