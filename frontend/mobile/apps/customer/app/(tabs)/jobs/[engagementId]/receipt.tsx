import { useLocalSearchParams } from "expo-router";

import { EngagementReceipt } from "@/features/engagement/view/receipt-screen";

export default function Screen() {
  const { engagementId } = useLocalSearchParams<{ engagementId: string }>();
  return <EngagementReceipt engagementId={engagementId} />;
}
