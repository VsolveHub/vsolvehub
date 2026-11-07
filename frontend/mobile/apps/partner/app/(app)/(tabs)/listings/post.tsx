import { useLocalSearchParams } from "expo-router";

import { PostJobWizard } from "@/features/listings/view/post-job-wizard";

export default function ListingPostRoute() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  return <PostJobWizard editId={edit || null} />;
}
