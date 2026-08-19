import type { Metadata } from "next";

import { QuotesScreen } from "@/features/quotes/view/quotes-screen";

/**
 * The quotes and estimates on one request — `M2-FE-407`..`M2-FE-414`,
 * `M2-FE-423`.
 *
 * Dynamic and never indexed: this is somebody's own job, priced by named
 * professionals, at their own address.
 *
 * Inside `app/(flow)/requests/layout.tsx`, so the whole tree is behind the one
 * `CustomerShell` session gate. Everything on this page is a record filed
 * against a Customer and refused to anybody else with a `404`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your quotes",
  robots: { index: false, follow: false },
};

export default async function RequestQuotesPage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;
  return (
    <main>
      <QuotesScreen
        requirementId={requirementId}
        requestHref={`/requests/${requirementId}`}
      />
    </main>
  );
}
