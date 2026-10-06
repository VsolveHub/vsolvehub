// Ported from frontend/packages/ui/src/summary.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface AddressSummaryProps {
  lines: readonly string[];
  note?: string;
  masked?: boolean;
  className?: string;
}

export function AddressSummary({ lines, note, masked = false, className }: AddressSummaryProps) {
  return (
    <View className={className}>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} className="text-sm text-text">
          {line}
        </Text>
      ))}
      {note ? <Text className="mt-1 text-sm text-text-secondary">{note}</Text> : null}
      {masked ? (
        <Text className="mt-1 text-xs text-text-muted">The full address is shared once you accept.</Text>
      ) : null}
    </View>
  );
}

export interface ScheduleSummaryProps {
  dates: string;
  hours?: string;
  serviceBy?: string;
  flexible?: boolean;
  className?: string;
}

export function ScheduleSummary({ dates, hours, serviceBy, flexible = false, className }: ScheduleSummaryProps) {
  return (
    <View className={className}>
      <Text className="text-sm text-text">
        {dates}
        {hours ? <Text className="text-text-secondary"> · {hours}</Text> : null}
      </Text>
      {flexible ? <Text className="mt-0.5 text-xs text-text-secondary">Dates can move</Text> : null}
      {serviceBy ? (
        <Text className="mt-1 text-xs font-medium text-warning-text">No longer useful after {serviceBy}</Text>
      ) : null}
    </View>
  );
}

export interface PersonCountProps {
  present: number;
  expected: number;
  noun?: string;
  qualifier?: string;
  className?: string;
}

export function PersonCount({ present, expected, noun = "worker", qualifier, className }: PersonCountProps) {
  const short = present < expected;
  const plural = expected === 1 ? noun : `${noun}s`;
  return (
    <Text className={cn("text-sm font-medium", short ? "text-warning-text" : "text-text", className)}>
      <Text className="font-bold tabular-nums">
        {present} of {expected}
      </Text>
      {` ${plural} present${qualifier ? ` ${qualifier}` : ""}`}
      {short ? (
        <Text className="text-xs font-normal text-warning-text">
          {`\n${expected - present} fewer than agreed. Settlement follows what was confirmed.`}
        </Text>
      ) : null}
    </Text>
  );
}

export interface FactListProps {
  items: readonly { label: string; value: ReactNode }[];
  className?: string;
}

export function FactList({ items, className }: FactListProps) {
  return (
    <View className={cn("gap-1.5", className)}>
      {items.map((item, index) => (
        <View key={`${index}-${item.label}`} className="flex-row justify-between gap-4">
          <Text className="text-sm text-text-secondary">{item.label}</Text>
          <Text className="text-right text-sm font-medium text-text">{item.value}</Text>
        </View>
      ))}
    </View>
  );
}
