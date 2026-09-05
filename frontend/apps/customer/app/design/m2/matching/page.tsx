import type { Metadata } from "next";

import { MatchingScreen } from "@/features/access/view/gallery/matching-screen";
import {
  NO_PROFESSIONAL_COPY,
  SAMPLE_CHOSEN_PLAN,
  SAMPLE_PARTNER,
  SAMPLE_SERVICE,
  SAMPLE_VISITS,
} from "@/lib/design-gallery/sample";

/**
 * `MatchingScreen` at artboard size.
 *
 * No auth and no app chrome of its own: there is no session to gate on and the
 * screen supplies its own header, scroll region and dock. The fixed 390x844
 * frame is the point — this is designed for a phone, and reviewing it full-bleed
 * on a desktop hides every spacing decision in it.
 *
 * The props are the shared `lib/design-gallery/sample` values, so the counts,
 * the times and the price cannot disagree with the neighbouring gallery screens.
 * Nothing here fetches: BE-2/BE-3/BE-4 are unpublished, and the wired route
 * arrives with them.
 *
 * NEVER import the sample from a real route. It is sample data, not a fallback.
 */

export const metadata: Metadata = {
  title: "Matching — M2",
  robots: { index: false, follow: false },
};

export default function MatchingGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-8">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <MatchingScreen
          serviceName={SAMPLE_SERVICE}
          visits={SAMPLE_VISITS}
          professional={SAMPLE_PARTNER}
          planPriceLabel={SAMPLE_CHOSEN_PLAN.priceLabel}
          noProfessionalCopy={NO_PROFESSIONAL_COPY}
        />
      </div>
    </div>
  );
}
