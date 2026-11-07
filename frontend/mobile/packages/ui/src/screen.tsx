// Ported from frontend/mobile/guide/03-design-system.md §3
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "./cn";

export interface ScreenProps {
  children: ReactNode;
  /** Wraps the body in a ScrollView. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  className?: string;
  contentClassName?: string;
}

export function Screen({
  children,
  scroll = false,
  refreshing = false,
  onRefresh,
  className,
  contentClassName,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={contentClassName}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn("flex-1", contentClassName)} style={{ paddingBottom: insets.bottom }}>
      {children}
    </View>
  );

  return (
    <View className={cn("flex-1 bg-canvas", className)} style={{ paddingTop: insets.top }}>
      {body}
    </View>
  );
}
