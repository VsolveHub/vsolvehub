import { useLocalSearchParams } from "expo-router";

import { StageReview } from "@/features/engagement/view/stage-review";

export default function Screen() {
  const { engagementId, stageId } = useLocalSearchParams<{ engagementId: string; stageId: string }>();
  return <StageReview engagementId={engagementId} stageId={stageId} />;
}
