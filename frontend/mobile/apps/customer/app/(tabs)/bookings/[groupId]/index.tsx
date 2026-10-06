import { useLocalSearchParams } from "expo-router";

import { GroupDetail } from "@/features/bookings/view/group-detail";

export default function Screen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <GroupDetail groupId={groupId} />;
}
