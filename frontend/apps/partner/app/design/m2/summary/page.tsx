import type { Metadata } from "next";

import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { EstimateSummaryScreen } from "@/features/proposal/view/estimate-summary-screen";

/**
 * Design gallery: the estimate money summary at phone size.
 *
 * Deliberately outside the partner shell. This route exists so the screen can be
 * looked at as a screen — one 390x844 frame, no tabs, no top bar — while the
 * contract that would feed it for real is still unpublished. It renders
 * `GALLERY_ESTIMATE`, which is sample data and never a fallback: nothing here is
 * reachable from a partner-facing route, and no partner-facing route may import
 * it.
 */
export const metadata: Metadata = {
  title: "Estimate summary",
  robots: { index: false, follow: false },
};

export default function EstimateSummaryGalleryPage() {
  return (
    <div className="min-h-screen bg-canvas py-8">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <EstimateSummaryScreen estimate={GALLERY_ESTIMATE} />
      </div>
    </div>
  );
}
