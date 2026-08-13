import type { Metadata } from "next";

import { ProjectEngagementsScreen } from "@/features/engagement/view/engagement-screens";

/**
 * The project engagement list — `M2-FE-601`.
 *
 * A stage is a stage: it is not a shift and it is not a job, and one `Engagement`
 * spine in the backend does not make the three one word here.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stages",
  robots: { index: false, follow: false },
};

export default function ProjectStagesPage() {
  return <ProjectEngagementsScreen heading="Stages" />;
}
