// Ported from frontend/packages/ui/src/skeleton.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface SkeletonProps {
  className?: string;
  circle?: boolean;
}

export function Skeleton({ className, circle = false }: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      className={cn("bg-surface-sunken", circle ? "rounded-full" : "rounded-plate", className)}
    />
  );
}

export function SkeletonRegion({
  loading,
  label,
  children,
  className,
}: {
  loading: boolean;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View accessibilityState={{ busy: loading }} className={className}>
      {loading ? <Text className="sr-only">{label}</Text> : null}
      {children}
    </View>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <View className={cn("gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", index === lines - 1 && lines > 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </View>
  );
}
