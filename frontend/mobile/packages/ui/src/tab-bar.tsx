// Ported from frontend/apps/customer/features/session/view/mobile-bottom-nav.tsx
// and frontend/apps/partner/features/session/partner-shell.tsx BottomTabBar.
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "./cn";
import { Text } from "./text";

export interface TabBarItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

export function customerTabBarClass(active: boolean): string {
  return cn(
    "min-w-16 items-center gap-1 rounded-xl px-2 py-1",
    active ? "text-action" : "text-text-muted",
  );
}

export function partnerTabBarClass(active: boolean): string {
  return cn(
    "min-h-14 items-center justify-center gap-1 px-1",
    active ? "text-surface font-bold" : "text-white/45",
  );
}

export function TabBar({
  items,
  activeHref,
  onPress,
  variant = "customer",
  label,
}: {
  items: readonly TabBarItem[];
  activeHref?: string;
  onPress?: (href: string) => void;
  variant?: "customer" | "partner";
  label: string;
}) {
  const insets = useSafeAreaInsets();
  const partner = variant === "partner";
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className={cn(
        "flex-row items-end justify-around border-t px-2 pt-3",
        partner ? "rounded-t-[1.75rem] border-transparent bg-navy-900" : "border-line bg-[#FAF9F7]",
      )}
      style={{ paddingBottom: Math.max(10, insets.bottom) }}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Pressable
            key={item.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onPress?.(item.href)}
            className={partner ? partnerTabBarClass(active) : customerTabBarClass(active)}
          >
            {item.icon}
            <Text
              className={cn(
                "text-[0.65rem] font-semibold tracking-wide",
                partner ? (active ? "text-surface" : "text-white/45") : active ? "text-action" : "text-text-muted",
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
