import type { Metadata } from "next";

import { EstimateDetailScreen } from "@/features/quotes/view/estimate-detail-screen";

/** One professional's estimate, read in full. Somebody's own job at their own address — never indexed. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estimate",
  robots: { index: false, follow: false },
};

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ requirementId: string; proposalId: string }>;
}) {
  const { requirementId, proposalId } = await params;
  return (
    <main>
      <EstimateDetailScreen requirementId={requirementId} proposalId={proposalId} />
    </main>
  );
}
