import { useLocalSearchParams } from "expo-router";

import { RentalDetailScreen } from "@/features/rentals/view/rental-detail-screen";

export default function RentalPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <RentalDetailScreen slug={slug || ""} />;
}
