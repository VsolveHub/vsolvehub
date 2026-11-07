import { useLocalSearchParams } from "expo-router";

import { StayDetailScreen } from "@/features/stays/view/stay-detail-screen";

export default function StayPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <StayDetailScreen slug={slug || ""} />;
}
