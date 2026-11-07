// Ported from frontend/packages/ui/src/disclosure.tsx
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface DisclosureProps {
  summary: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Disclosure({ summary, hint, children, defaultOpen = false, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className={className}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="min-h-11 flex-row items-center gap-1.5 rounded-control py-1"
      >
        <Text className="text-sm text-text-link">{open ? "▾" : "▸"}</Text>
        <Text className="flex-1 text-sm font-medium text-text-link">{summary}</Text>
        {hint ? <Text className="text-xs font-medium text-text-muted">{hint}</Text> : null}
      </Pressable>
      {open ? <Text className={cn("mt-2 text-sm text-text-secondary")}>{children}</Text> : null}
    </View>
  );
}
