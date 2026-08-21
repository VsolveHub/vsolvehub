import type { Metadata } from "next";

import { BookCrewFeeScreen } from "@/features/crew/view/book-crew-fee-screen";

/**
 * The A3 booking-fee checkout — `M2-FE-428`.
 *
 * A route rather than a modal because its accepted-crew recovery screen is
 * addressable. A Customer who closed the tab mid-UPI comes back to this URL;
 * the rate-card read behind it answers from the requirement id alone, so the
 * recovery needs nothing the browser might have lost.
 *
 * Nothing is refused here at the route level. The screen renders whatever the
 * server says: no booking, a lapsed hold, a settled fee and an A5 requirement
 * all reach their own honest state rather than a 404 the Customer has to guess
 * at.
 *
 * Dynamic and never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your crew",
  robots: { index: false, follow: false },
};

export default async function BookCrewFeePage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;
  return (
    <main>
      <BookCrewFeeScreen
        requirementId={requirementId}
        requestHref={`/requests/${requirementId}`}
      />
    </main>
  );
}
