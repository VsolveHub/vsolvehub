import type { Metadata } from "next";

import { RequestDetailScreen } from "@/features/requirement/view/request-detail-screen";

/**
 * One request and its timeline — `M2-FE-214`, `M2-FE-215`, `M2-FE-211`.
 *
 * Dynamic and never indexed. This is somebody's own job, at their own address,
 * with their own history on it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your request",
  robots: { index: false, follow: false },
};

export default async function RequestPage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;
  return (
    <main>
      <RequestDetailScreen requirementId={requirementId} />
    </main>
  );
}
