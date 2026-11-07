// Ported from frontend/packages/ui/src/timeline.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export type TimelineTone = "neutral" | "active" | "success" | "warning" | "danger";

const markerTones: Record<TimelineTone, string> = {
  neutral: "bg-line-strong",
  active: "bg-action",
  success: "bg-success",
  warning: "bg-warning-text",
  danger: "bg-danger",
};

export interface TimelineEventProps {
  title: string;
  timestamp: string;
  actor?: string;
  children?: ReactNode;
  tone?: TimelineTone;
  className?: string;
}

export function TimelineEvent({ title, timestamp, actor, children, tone = "neutral", className }: TimelineEventProps) {
  return (
    <View className={cn("flex-row gap-3 pb-5", className)}>
      <View className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", markerTones[tone])} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-sm font-semibold text-text">{title}</Text>
          <Text className="text-xs text-text-muted">{timestamp}</Text>
        </View>
        {actor ? <Text className="mt-0.5 text-xs text-text-secondary">{actor}</Text> : null}
        {children ? <View className="mt-1.5">{children}</View> : null}
      </View>
    </View>
  );
}

export interface TimelineProps {
  children: ReactNode;
  label: string;
  className?: string;
}

export function Timeline({ children, label, className }: TimelineProps) {
  return (
    <View accessibilityLabel={label} className={className}>
      {children}
    </View>
  );
}
