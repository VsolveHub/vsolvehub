import { Button, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";

import { useEngagement } from "@/features/engagement/queries";

export function EngagementReceipt({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const engagement = useEngagement(engagementId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await engagement.refetch();
    setRefreshing(false);
  };

  if (engagement.isPending) return <Spinner size="sm" />;
  if (!engagement.data) {
    return (
      <View className="flex-1 bg-canvas p-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Agreement"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push(`/engagements/${engagementId}` as never);
            }
          }}
          className="mb-4 size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <Text className="text-text-secondary">This receipt is not on your account.</Text>
      </View>
    );
  }
  const record = engagement.data;
  const summary = `${record.service_name}\n${record.status}\n${formatMoney(record.total_paise)}`;
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-3 px-4 py-6"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Agreement"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push(`/engagements/${engagementId}` as never);
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <Text className="text-2xl font-extrabold text-text">Receipt</Text>
      </View>
      <Text className="text-base font-semibold text-text">{record.service_name}</Text>
      <Text className="text-sm text-text-secondary">{record.status}</Text>
      <Text className="text-lg font-bold text-text">{formatMoney(record.total_paise)}</Text>
      <Button variant="ghost" onPress={() => void Share.share({ message: summary })}>
        Share
      </Button>
    </ScrollView>
  );
}
