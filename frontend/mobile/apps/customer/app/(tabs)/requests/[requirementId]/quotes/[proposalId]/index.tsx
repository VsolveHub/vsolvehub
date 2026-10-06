import { useLocalSearchParams } from "expo-router";

import { EstimateDetail } from "@/features/quotes/view/estimate-detail";

export default function Screen() {
  const { requirementId, proposalId } = useLocalSearchParams<{ requirementId: string; proposalId: string }>();
  return <EstimateDetail requirementId={requirementId} proposalId={proposalId} />;
}
