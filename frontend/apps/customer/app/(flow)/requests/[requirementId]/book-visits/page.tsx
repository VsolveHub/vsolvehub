import type { Metadata } from "next";

import { BookVisitsScreen } from "@/features/access/view/book-visits-screen";

/**
 * The A5 visit-plan checkout — `M2-FE-420`.
 *
 * A route rather than a modal, and the reason is the same one the payment
 * feature gives: a payment is a record that outlives the screen that started it.
 * A Customer who closed the tab mid-UPI comes back to a URL, and this is it —
 * the plan read behind it answers from the requirement id alone, so the recovery
 * needs nothing the browser might have lost.
 *
 * Dynamic and never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book your visits",
  robots: { index: false, follow: false },
};

export default async function BookVisitsPage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;
  return (
    <main>
      <BookVisitsScreen
        requirementId={requirementId}
        requestHref={`/requests/${requirementId}`}
      />
    </main>
  );
}
