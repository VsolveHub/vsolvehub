// Ported from frontend/packages/ui/src/step-dock.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "./cn";
import { Text } from "./text";

export interface StepDockProps {
  label?: string;
  amount?: ReactNode;
  children: ReactNode;
  caption?: ReactNode;
  className?: string;
}

export function StepDock({ label, amount, children, caption, className }: StepDockProps) {
  const insets = useSafeAreaInsets();
  const hasAmount = label !== undefined || amount !== undefined;
  return (
    <View
      className={cn("border-t border-line bg-surface px-4 pt-3", className)}
      style={{ paddingBottom: Math.max(16, insets.bottom) }}
    >
      <View className="gap-2.5">
        {hasAmount ? (
          <View className="flex-row items-baseline justify-between gap-3">
            {label !== undefined ? (
              <Text className="text-[11px] font-bold uppercase text-text-muted">{label}</Text>
            ) : null}
            {amount !== undefined ? (
              <Text accessibilityLiveRegion="polite" className="text-[1.625rem] font-extrabold tabular-nums text-text">
                {amount}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
        {caption !== undefined ? (
          <Text className="text-center text-xs font-medium text-text-muted">{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}
