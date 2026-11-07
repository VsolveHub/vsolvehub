import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@vsolve/mobile-ui";

export function PhoneFrame({
  title,
  step,
  onBack,
  reassurance,
  action,
  children,
  onRefresh,
  refreshing: refreshingProp,
}: {
  title: string;
  step?: string;
  onBack: () => void;
  reassurance?: string;
  action?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const refreshing = refreshingProp ?? internalRefreshing;

  const handleRefresh = async () => {
    setInternalRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } finally {
      setInternalRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF8F5]">
      {/* Step Subheader: Back arrow + Title on left, Step on far right */}
      <View
        style={{ paddingTop: Math.max(insets.top, 8) }}
        className="border-b border-slate-200/80 bg-white px-3.5 pb-2.5"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 flex-1 min-w-0 pr-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={onBack}
              className="size-8 items-center justify-center active:opacity-70 -ml-1"
            >
              <ChevronLeft size={24} color="#0B1B3D" strokeWidth={2.4} />
            </Pressable>
            <Text numberOfLines={1} className="text-base font-extrabold text-[#0B1B3D]">
              {title}
            </Text>
          </View>
          {step ? (
            <Text className="text-xs font-semibold text-slate-500 shrink-0">
              {step}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pt-4 pb-32"
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        }
      >
        {children}
      </ScrollView>

      {/* Floating Sticky Bottom Action Bar matching user screenshots */}
      {action !== undefined || reassurance !== undefined ? (
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          className="absolute bottom-0 left-0 right-0 border-t border-slate-200/70 bg-white/95 px-4 pt-2.5 shadow-lg backdrop-blur-md"
        >
          {reassurance ? (
            <Text className="mb-2 text-center text-xs font-medium text-slate-500">
              {reassurance}
            </Text>
          ) : null}
          {action}
        </View>
      ) : null}
    </View>
  );
}

export function ScreenHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View className="pb-1">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-[#8A7E72]">
        {eyebrow}
      </Text>
      <Text className="mt-1 text-2xl font-black tracking-tight text-[#0B1B3D]">
        {title}
      </Text>
    </View>
  );
}
