import type { Metadata } from "next";
import Link from "next/link";

import { HeldVisitScreen } from "@/features/visit/view/gallery/held-visit-screen";

/**
 * `HeldVisitScreen` at artboard size.
 *
 * The state between accepting a visit and being allowed to travel to it. BE-4
 * turns a hold into a booking only on a verified payment, so this screen is
 * what a partner sees for the minutes in between — which is why the sample
 * keeps the address locked rather than showing a street.
 */

export const metadata: Metadata = {
  title: "Held visit — M2",
  robots: { index: false, follow: false },
};

export default function HeldVisitGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-canvas px-4 py-8">
      <Link
        href="/design/m2"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-text-link"
      >
        ← All M2 screens
      </Link>

      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <HeldVisitScreen
          serviceName="General Electrical Works"
          dateLabel="Mon 19 May"
          startsLabel="10:00"
          approximateAreaLabel="Kukatpally, 500072"
          earningLabel="₹149"
          confirmWindowLabel="15 minutes"
        />
      </div>
    </div>
  );
}
