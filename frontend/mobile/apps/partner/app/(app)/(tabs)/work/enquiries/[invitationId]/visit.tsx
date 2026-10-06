import { useLocalSearchParams } from "expo-router";

import { VisitScreen } from "@/features/visit/view/visit-screen";

export default function Screen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
  return <VisitScreen invitationId={invitationId} />;
}
