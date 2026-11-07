import { useLocalSearchParams } from "expo-router";

import { OfferDetailScreen } from "@/features/crew-offer/view/offer-detail-screen";

export default function Screen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
  return <OfferDetailScreen invitationId={invitationId} />;
}
