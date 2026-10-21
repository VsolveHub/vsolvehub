// Ported from frontend/apps/customer/features/crew/view/event-summary.tsx
import { Text, cn } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

export interface SummaryLine {
  key: string;
  label: string;
  value: string | null;
  icon?: ReactNode;
}

export function EventSummaryCard({
  title = "Your event",
  lines,
  onChange,
  changeLabel = "Change",
  className,
}: {
  title?: string;
  lines: readonly SummaryLine[];
  onChange?: () => void;
  changeLabel?: string;
  className?: string;
}) {
  return (
    <View className={cn("rounded-[16px] border border-line bg-surface", className)}>
      <View className="flex-row items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <Text className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{title}</Text>
        {onChange ? (
          <Pressable hitSlop={6} accessibilityRole="button" onPress={onChange} className="min-h-9 justify-center">
            <Text className="text-[13px] font-bold text-text-link">{changeLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {lines.map((line) => (
        <View key={line.key} className="flex-row items-center gap-3 border-b border-line px-3.5 py-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">{line.label}</Text>
            <Text className={cn("text-sm font-semibold leading-5", line.value === null ? "text-text-muted" : "text-text")}>
              {line.value ?? "Not chosen"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
