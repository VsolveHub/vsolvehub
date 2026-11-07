import { useLocalSearchParams } from "expo-router";

import { RequestDetail } from "@/features/requirement/view/request-detail";

export default function Screen() {
  const { requirementId } = useLocalSearchParams<{ requirementId: string }>();
  return <RequestDetail requirementId={requirementId} />;
}
