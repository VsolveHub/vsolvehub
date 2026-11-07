// Ported from frontend/packages/ui/src/segmented.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export function segmentStyles({
  selected = false,
  className,
}: {
  selected?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "min-h-[2.375rem] flex-1 flex-row items-center justify-center gap-1.5 rounded-control px-3",
    selected ? "bg-surface" : "",
    className,
  );
}

export function SegmentedTrack({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className={cn("flex-row gap-1 rounded-[0.625rem] bg-surface-sunken p-1", className)}
    >
      {children}
    </View>
  );
}

export function SegmentCount({ value, selected = false }: { value: number; selected?: boolean }) {
  return (
    <View
      className={cn(
        "h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1",
        selected ? "bg-action" : "bg-warm-200",
      )}
    >
      <Text className={cn("text-[0.6875rem] font-extrabold", selected ? "text-action-text" : "text-warm-600")}>
        {value}
      </Text>
    </View>
  );
}
