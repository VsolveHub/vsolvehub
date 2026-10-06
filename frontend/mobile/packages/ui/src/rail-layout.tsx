// Ported from frontend/packages/ui/src/rail-layout.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface RailLayoutProps {
  children: ReactNode;
  rail: ReactNode;
  railLabel: string;
  railWidth?: "20rem" | "24rem";
  className?: string;
}

export function RailLayout({ children, rail, railLabel, className }: RailLayoutProps) {
  return (
    <View className={cn("gap-6", className)}>
      {children}
      <View accessibilityLabel={railLabel}>{rail}</View>
    </View>
  );
}

export interface RailHeadlineProps {
  eyebrow: string;
  value: string;
  unit?: string;
  footnote?: ReactNode;
  className?: string;
}

export function RailHeadline({ eyebrow, value, unit, footnote, className }: RailHeadlineProps) {
  return (
    <View className={cn("rounded-card bg-navy-900 p-5", className)}>
      <Text className="text-[0.6875rem] font-bold uppercase text-action">{eyebrow}</Text>
      <Text className="mt-2.5 text-[2.75rem] font-extrabold tabular-nums text-text-inverse">{value}</Text>
      {unit ? <Text className="text-sm text-navy-200">{unit}</Text> : null}
      {footnote ? <Text className="mt-2 text-sm text-navy-200">{footnote}</Text> : null}
    </View>
  );
}

export interface RailMoneyRow {
  label: string;
  note?: string | null;
  amount: string | null;
  emphasis?: boolean;
  tinted?: boolean;
}

export function RailMoney({ rows, className }: { rows: readonly RailMoneyRow[]; className?: string }) {
  return (
    <View className={cn("overflow-hidden rounded-card border border-line bg-surface", className)}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          className={cn("flex-row items-baseline justify-between gap-3 px-4 py-3.5", index > 0 && "border-t border-line", row.tinted && "bg-surface-hover")}
        >
          <View className="min-w-0 flex-1">
            <Text className={cn("text-text", row.emphasis ? "text-[0.9375rem] font-bold" : "text-[0.8438rem] font-semibold")}>
              {row.label}
            </Text>
            {row.note ? <Text className="mt-0.5 text-xs text-text-muted">{row.note}</Text> : null}
          </View>
          <Text className={cn("tabular-nums text-text", row.emphasis ? "text-[1.3125rem] font-extrabold" : "text-[0.9375rem] font-semibold", row.amount === null && "text-text-muted")}>
            {row.amount ?? "—"}
          </Text>
        </View>
      ))}
    </View>
  );
}
