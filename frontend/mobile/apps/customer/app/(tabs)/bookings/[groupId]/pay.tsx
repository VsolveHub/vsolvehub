import { useLocalSearchParams } from "expo-router";

import { PayScreen } from "@/features/payment/view/pay-screen";

export default function Screen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <PayScreen groupId={groupId} />;
}
