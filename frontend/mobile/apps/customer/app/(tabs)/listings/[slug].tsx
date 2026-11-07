import { useLocalSearchParams } from "expo-router";

import { ListingDetailScreen } from "@/features/listings/view/listing-detail-screen";

export default function ListingPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ListingDetailScreen slug={slug || ""} />;
}
