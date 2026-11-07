import { useLocalSearchParams } from "expo-router";

import { QuotesScreen } from "@/features/quotes/view/quotes-screen";

export default function Screen() {
  const { requirementId } = useLocalSearchParams<{ requirementId: string }>();
  return <QuotesScreen requirementId={requirementId} />;
}
