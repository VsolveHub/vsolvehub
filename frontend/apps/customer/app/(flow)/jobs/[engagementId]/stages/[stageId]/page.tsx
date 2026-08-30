import type { Metadata } from "next";

import StageReviewPage from "../../../../engagements/[engagementId]/stages/[stageId]/page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check the work",
  robots: { index: false, follow: false },
};

export default StageReviewPage;
