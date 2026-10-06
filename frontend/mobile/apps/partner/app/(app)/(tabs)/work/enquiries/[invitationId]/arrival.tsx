import { useLocalSearchParams } from "expo-router";

import { ArrivalScreen } from "@/features/visit/view/arrival-screen";

export default function Screen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
  return <ArrivalScreen invitationId={invitationId} />;
}
