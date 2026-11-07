import { useLocalSearchParams } from "expo-router";

import { DispatchOfferScreen } from "@/features/dispatch/view/dispatch-offer-screen";

export default function Screen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  return <DispatchOfferScreen offerId={offerId} />;
}
