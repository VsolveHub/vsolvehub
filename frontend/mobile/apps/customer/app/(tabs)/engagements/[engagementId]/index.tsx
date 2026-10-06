import { useLocalSearchParams } from "expo-router";

import { EngagementScreen } from "@/features/engagement/view/engagement-screen";

export default function Screen() {
  const { engagementId } = useLocalSearchParams<{ engagementId: string }>();
  return <EngagementScreen engagementId={engagementId} />;
}
