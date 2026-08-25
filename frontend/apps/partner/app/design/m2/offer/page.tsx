import type { Metadata } from "next";
import Link from "next/link";

import { FixedTimeOfferScreen } from "@/features/visit/view/gallery/fixed-time-offer-screen";

/**
 * `FixedTimeOfferScreen` at artboard size.
 *
 * BE-3 is unpublished — there is no fixed-time A5 offer on the wire yet — so
 * every value below is fixed sample data and nothing is fetched. The countdown
 * is frozen at a moment rather than ticking: this is a still of a screen, and a
 * live timer here would be the one thing on the page pretending to be real.
 */

export const metadata: Metadata = {
  title: "Fixed-time offer — M2",
  robots: { index: false, follow: false },
};

export default function FixedTimeOfferGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-canvas px-4 py-8">
      <Link
        href="/design/m2"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-text-link"
      >
        ← All M2 screens
      </Link>

      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <FixedTimeOfferScreen
          serviceName="General Electrical Works"
          areaLabel="Kukatpally"
          dateLabel="Mon 19 May"
          startsLabel="10:00 · 2 hrs"
          earningLabel="₹149"
          countdownLabel="1:42"
          remainingSeconds={102}
          windowSeconds={180}
        />
      </div>
    </div>
  );
}
