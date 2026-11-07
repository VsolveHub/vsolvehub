import { useLocalSearchParams } from "expo-router";

import { NewRequestScreen } from "@/features/requirement/view/new-request-screen";

export default function Screen() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <NewRequestScreen serviceSlug={service} />;
}
