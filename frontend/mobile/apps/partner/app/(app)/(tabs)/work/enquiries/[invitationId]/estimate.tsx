import { useLocalSearchParams } from "expo-router";

import { EstimateScreen } from "@/features/proposal/view/estimate-screen";

export default function Screen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
  return <EstimateScreen invitationId={invitationId} />;
}
