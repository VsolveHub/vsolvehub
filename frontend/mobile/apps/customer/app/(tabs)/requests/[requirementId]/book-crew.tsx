import { useLocalSearchParams } from "expo-router";

import { BookCrewFeeScreen } from "@/features/crew/view/book-crew-fee-screen";

export default function Screen() {
  const { requirementId } = useLocalSearchParams<{ requirementId: string }>();
  return <BookCrewFeeScreen requirementId={requirementId} />;
}
