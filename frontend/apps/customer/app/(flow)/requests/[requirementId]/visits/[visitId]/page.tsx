import type { Metadata } from "next";

import { VisitDetailScreen } from "@/features/access/view/visit-detail-screen";

/**
 * One site visit: who is coming, the arrival code, and what happens next.
 *
 * Dynamic and never indexed. This page names a professional and carries a live
 * arrival code for a job at somebody's own address — it is the most private
 * screen in the app, and the code on it is the thing that opens a visit.
 *
 * Inside `app/(flow)/requests/layout.tsx`, so it sits behind the same
 * `CustomerShell` session gate as the rest of the tree. The server refuses the
 * reads behind it to anybody else with a `404` regardless, and the arrival-code
 * route is scoped to the Customer alone — a vendor who could fetch the code they
 * are meant to be *given* would make the whole proof worthless.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your visit",
  robots: { index: false, follow: false },
};

export default async function RequestVisitPage({
  params,
}: {
  params: Promise<{ requirementId: string; visitId: string }>;
}) {
  const { requirementId, visitId } = await params;
  return (
    <main>
      <VisitDetailScreen requirementId={requirementId} siteVisitId={visitId} />
    </main>
  );
}
