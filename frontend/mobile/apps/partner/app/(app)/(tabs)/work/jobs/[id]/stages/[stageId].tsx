import { useLocalSearchParams } from "expo-router";

import { StageScreen } from "@/features/engagement/view/stage-work-screen";

export default function Screen() {
  const { id, stageId } = useLocalSearchParams<{ id: string; stageId: string }>();
  return <StageScreen engagementId={id} stageId={stageId} />;
}
