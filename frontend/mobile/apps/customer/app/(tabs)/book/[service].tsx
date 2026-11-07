import { useLocalSearchParams } from "expo-router";

import { BookScreen } from "@/features/booking/view/book-screen";

export default function Screen() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookScreen serviceSlug={service} />;
}
