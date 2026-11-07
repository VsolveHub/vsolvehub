// Ported from frontend/packages/ui/src/fact-tile.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface FactTileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  locked?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FactTile({ icon, label, value, locked = false, onClick, className }: FactTileProps) {
  const body = (
    <>
      <View className={cn("h-10 w-10 items-center justify-center rounded-[14px]", locked ? "bg-surface-sunken" : "bg-selected-surface")}>
        {icon}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[10px] font-bold uppercase text-text-muted">{label}</Text>
        <Text className={cn("mt-0.5 text-sm font-extrabold tabular-nums", locked ? "text-text-muted" : "text-text")} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </>
  );
  const classes = cn(
    "flex-row items-center gap-3 rounded-card p-3",
    locked ? "border border-dashed border-warm-400" : "border border-line bg-surface",
    className,
  );
  if (onClick) {
    return (
      <Pressable accessibilityRole="button" onPress={onClick} className={classes}>
        {body}
      </Pressable>
    );
  }
  return <View className={classes}>{body}</View>;
}
