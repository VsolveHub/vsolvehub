// Ported from frontend/apps/customer/features/quotes/view/material-list-rows.tsx
import { cn, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { QuoteMaterialListRowView } from "../adapters";

export function MaterialListRows({
  rows,
  className,
}: {
  rows: readonly QuoteMaterialListRowView[];
  className?: string;
}) {
  return (
    <View className={cn("flex-col", className)}>
      {rows.map((row, index) => (
        <View
          key={`${row.title}-${index}`}
          className="flex-row items-start justify-between gap-3 border-b border-line py-2"
        >
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold leading-5 text-text">{row.title}</Text>
            {row.spec !== null ? <Text className="text-xs leading-4 text-text-muted">{row.spec}</Text> : null}
            {row.note !== null ? (
              <Text className="mt-0.5 text-[11px] leading-4 text-text-muted">{row.note}</Text>
            ) : null}
          </View>
          <Text className="shrink-0 text-sm font-extrabold text-text">{row.quantityLabel}</Text>
        </View>
      ))}
    </View>
  );
}

export function materialListText({
  serviceName,
  rows,
  brandTierLabel,
}: {
  serviceName: string;
  rows: readonly QuoteMaterialListRowView[];
  brandTierLabel: string | null;
}): string {
  const lines = rows.map((row) => {
    const detail = [row.spec, row.note].filter((part): part is string => part !== null);
    return `- ${row.title} × ${row.quantityLabel}${detail.length > 0 ? ` (${detail.join("; ")})` : ""}`;
  });
  return [
    `What to buy — ${serviceName}:`,
    ...(brandTierLabel !== null ? [brandTierLabel] : []),
    ...lines,
    "Shared from Vsolve",
  ].join("\n");
}
