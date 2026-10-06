import { useLocalSearchParams } from "expo-router";

import { QuestionThread } from "@/features/quotes/view/question-thread";

export default function Screen() {
  const { requirementId, proposalId } = useLocalSearchParams<{ requirementId: string; proposalId: string }>();
  return <QuestionThread requirementId={requirementId} proposalId={proposalId} />;
}
