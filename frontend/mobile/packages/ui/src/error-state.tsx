// Ported from frontend/packages/ui/src/error-state.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorStateProps {
  title: string;
  message: string;
  severity?: ErrorSeverity;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  reference?: string | null;
  icon?: ReactNode;
  inline?: boolean;
  className?: string;
}

const SEVERITY_STYLES: Record<ErrorSeverity, string> = {
  error: "border-danger-line bg-danger-surface",
  warning: "border-warning-line bg-warning-surface",
  info: "border-info-line bg-info-surface",
};

const INK: Record<ErrorSeverity, string> = {
  error: "text-danger-text",
  warning: "text-warning-text",
  info: "text-info-text",
};

export function ErrorState({
  title,
  message,
  severity = "error",
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  reference,
  icon,
  inline = false,
  className,
}: ErrorStateProps) {
  const ink = INK[severity];
  return (
    <View
      accessibilityRole={severity === "info" ? "summary" : "alert"}
      accessibilityLiveRegion={severity === "info" ? "polite" : "assertive"}
      className={cn(
        "flex-row gap-3 rounded-card border",
        inline ? "p-3" : "p-5",
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      <Text className={cn("text-base", ink)}>{icon ?? (severity === "info" ? "i" : "!")}</Text>
      <View className="min-w-0 flex-1">
        <Text className={cn("font-semibold", ink, inline ? "text-sm" : "text-base")}>{title}</Text>
        <Text className={cn("mt-1 text-sm", ink)}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} className="mt-3 min-h-11 justify-center">
            <Text className={cn("text-sm font-semibold", ink)}>{actionLabel}</Text>
          </Pressable>
        ) : null}
        {secondaryLabel && onSecondary ? (
          <Pressable accessibilityRole="button" onPress={onSecondary} className="min-h-11 justify-center">
            <Text className={cn("text-sm font-medium underline", ink)}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
        {reference ? (
          <Text className={cn("mt-3 font-mono text-xs", ink)}>Reference: {reference}</Text>
        ) : null}
      </View>
    </View>
  );
}
