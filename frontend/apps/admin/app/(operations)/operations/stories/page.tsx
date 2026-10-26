import type { Metadata } from "next";
import { PageHeader } from "@vsolve/ui";

import { StoriesWorkspace } from "@/features/stories/view/stories-workspace";

export const metadata: Metadata = {
  title: "Safety stories",
  description: "Publish, manage, and monitor 24-hour safety and awareness stories on the customer portal.",
};

export default function SafetyStoriesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Safety Stories"
        description="Publish 24-hour visual awareness stories (photos and short videos) to the customer home feed. Stories automatically expire after 24 hours."
      />
      <StoriesWorkspace />
    </div>
  );
}
