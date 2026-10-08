import { useLocalSearchParams } from "expo-router";

import { ListingApplicantsScreen } from "@/features/listings/view/listing-applicants-screen";

export default function ListingApplicantsRoute() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();

  return <ListingApplicantsScreen listingId={listingId || ""} />;
}
