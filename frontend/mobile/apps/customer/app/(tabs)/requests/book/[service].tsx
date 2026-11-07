import { useLocalSearchParams } from "expo-router";

import { BookCrewScreen } from "@/features/crew/view/book-crew-screen";

export default function Screen() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookCrewScreen serviceSlug={service} />;
}
