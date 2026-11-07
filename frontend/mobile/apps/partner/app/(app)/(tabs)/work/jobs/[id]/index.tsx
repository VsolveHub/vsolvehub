import { useLocalSearchParams } from "expo-router";

import { JobDetailScreen } from "@/features/work-stack/view/job-detail-screen";

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JobDetailScreen id={id} />;
}
