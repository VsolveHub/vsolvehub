// Ported from frontend/packages/ui/src/section-band.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface SectionBandProps {
  children: ReactNode;
  trailing?: ReactNode;
  trailingTone?: "total" | "muted";
  className?: string;
}

export function SectionBand({ children, trailing, trailingTone = "total", className }: SectionBandProps) {
  return (
    <View className={cn("flex-row items-baseline justify-between gap-3 pb-2", className)}>
      <Text className="text-[11px] font-extrabold uppercase text-text-muted">{children}</Text>
      {trailing !== undefined ? (
        <Text className={cn("text-[12.5px] font-extrabold tabular-nums", trailingTone === "total" ? "text-text-link" : "text-text-muted")}>
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}
