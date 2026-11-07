import { useLocalSearchParams } from "expo-router";

import { ShiftDayScreen } from "@/features/engagement/view/stage-work-screen";

export default function Screen() {
  const { id, stageId } = useLocalSearchParams<{ id: string; stageId: string }>();
  return <ShiftDayScreen engagementId={id} stageId={stageId} />;
}
