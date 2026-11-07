import { useLocalSearchParams } from "expo-router";

import { GroupReceipt } from "@/features/bookings/view/group-receipt";

export default function Screen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <GroupReceipt groupId={groupId} />;
}
