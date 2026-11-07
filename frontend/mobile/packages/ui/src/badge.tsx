// Ported from frontend/packages/ui/src/badge.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "action" | "brand";

const INFO = "bg-info-surface";
const tones: Record<Tone, string> = {
  success: "bg-success-surface",
  warning: "bg-warning-surface",
  danger: "bg-danger-surface",
  info: INFO,
  brand: INFO,
  neutral: "bg-surface-sunken",
  action: "bg-signal-50",
};
const ink: Record<Tone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  info: "text-info-text",
  brand: "text-info-text",
  neutral: "text-text-secondary",
  action: "text-signal-700",
};

export interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", dot = false, children, className }: BadgeProps) {
  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1",
        tones[tone],
        className,
      )}
    >
      {dot ? <View className={cn("h-1.5 w-1.5 rounded-full bg-current", ink[tone])} /> : null}
      <Text className={cn("text-xs font-semibold", ink[tone])}>{children}</Text>
    </View>
  );
}
