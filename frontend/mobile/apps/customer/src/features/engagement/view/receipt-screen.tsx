// Receipt for one engagement. Print is Share on a phone.
import { Button, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { Share, View } from "react-native";

import { useEngagement } from "@/features/engagement/queries";

export function EngagementReceipt({ engagementId }: { engagementId: string }) {
  const engagement = useEngagement(engagementId);
  if (engagement.isPending) return <Spinner size="sm" />;
  if (!engagement.data) return <Text className="p-4 text-text-secondary">This receipt is not on your account.</Text>;
  const record = engagement.data;
  const summary = `${record.service_name}\n${record.status}\n${formatMoney(record.total_paise)}`;
  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">Receipt</Text>
      <Text className="text-base font-semibold text-text">{record.service_name}</Text>
      <Text className="text-sm text-text-secondary">{record.status}</Text>
      <Text className="text-lg font-bold text-text">{formatMoney(record.total_paise)}</Text>
      <Button variant="ghost" onPress={() => void Share.share({ message: summary })}>
        Share
      </Button>
    </View>
  );
}
