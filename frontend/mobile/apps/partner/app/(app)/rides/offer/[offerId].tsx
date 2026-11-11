import { useLocalSearchParams } from "expo-router";

import { RideOfferScreen } from "@/features/rides/view/ride-offer-screen";

export default function RidesOfferRoute() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  return <RideOfferScreen offerId={offerId} />;
}
