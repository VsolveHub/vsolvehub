import { useLocalSearchParams } from "expo-router";

import { ServiceScreen } from "@/features/catalog/view/service-screen";

export default function Screen() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <ServiceScreen serviceSlug={service} />;
}
