import { useLocalSearchParams } from "expo-router";

import { ConfirmChoice } from "@/features/quotes/view/confirm-choice";

export default function Screen() {
  const { requirementId, proposalId } = useLocalSearchParams<{ requirementId: string; proposalId: string }>();
  return <ConfirmChoice requirementId={requirementId} proposalId={proposalId} />;
}
