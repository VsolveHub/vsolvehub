import { useLocalSearchParams } from "expo-router";

import { VisitDetail } from "@/features/access/view/visit-detail";

export default function Screen() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return <VisitDetail visitId={visitId} />;
}
