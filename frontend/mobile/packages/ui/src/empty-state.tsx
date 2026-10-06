// Ported from frontend/packages/ui/src/empty-state.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <View
      className={cn(
        "items-center rounded-card border border-dashed border-line bg-surface",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {icon}
      <Text className={cn("text-center font-semibold text-text", compact ? "text-sm" : "text-base")}>
        {title}
      </Text>
      {description ? (
        <Text className={cn("text-center text-text-secondary", compact ? "text-xs" : "text-sm")}>
          {description}
        </Text>
      ) : null}
      {action ? <View className={compact ? "mt-1" : "mt-2"}>{action}</View> : null}
    </View>
  );
}
