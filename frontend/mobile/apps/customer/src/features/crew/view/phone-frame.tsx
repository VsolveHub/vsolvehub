// Ported from frontend/apps/customer/features/booking/view/mobile-screen.tsx
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@vsolve/mobile-ui";

export function PhoneFrame({
  title,
  step,
  onBack,
  reassurance,
  action,
  children,
}: {
  title: string;
  step?: string;
  onBack: () => void;
  reassurance?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-line px-3 py-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} className="size-10 items-center justify-center">
          <Text className="text-2xl text-text">‹</Text>
        </Pressable>
        <View className="min-w-0 flex-1">
          {step ? <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">{step}</Text> : null}
          <Text numberOfLines={1} className="text-base font-bold text-text">
            {title}
          </Text>
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 py-4">
        {children}
      </ScrollView>
      {action !== undefined || reassurance !== undefined ? (
        <View className="border-t border-line bg-surface px-4 pt-3" style={{ paddingBottom: Math.max(16, insets.bottom) }}>
          {action}
          {reassurance ? <Text className="mt-2 text-center text-xs font-medium text-text-muted">{reassurance}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function ScreenHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View>
      <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-signal-700">{eyebrow}</Text>
      <Text className="mt-1 text-2xl font-bold tracking-tight text-text">{title}</Text>
    </View>
  );
}
