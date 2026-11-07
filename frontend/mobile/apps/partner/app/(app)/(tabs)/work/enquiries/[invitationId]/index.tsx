import { useLocalSearchParams } from "expo-router";

import { EnquiryDetailScreen } from "@/features/enquiry/view/enquiry-detail-screen";

export default function Screen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
  return <EnquiryDetailScreen invitationId={invitationId} />;
}
