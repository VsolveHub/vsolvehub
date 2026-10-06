// Ported from frontend/packages/ui/src/card.tsx
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

type CardPadding = "none" | "sm" | "md" | "lg";

const cardPaddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3.5",
  md: "p-4",
  lg: "p-6",
};

export interface CardProps extends ViewProps {
  padding?: CardPadding;
  className?: string;
}

export function Card({ className, padding = "lg", ...props }: CardProps) {
  return (
    <View
      className={cn("rounded-card border border-line bg-surface", cardPaddings[padding], className)}
      {...props}
    />
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <Card className="p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</Text>
        {icon ? (
          <View className="size-9 items-center justify-center rounded-control bg-navy-50">{icon}</View>
        ) : null}
      </View>
      <View className="mt-3 flex-row items-baseline justify-between gap-2">
        <Text className="text-2xl font-extrabold text-text">{value}</Text>
        {trend ? <Text className="text-xs font-semibold">{trend}</Text> : null}
      </View>
    </Card>
  );
}
