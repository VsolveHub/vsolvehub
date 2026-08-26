import type { Metadata } from "next";

import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { EstimatePreviewScreen } from "@/features/proposal/view/estimate-preview-screen";

/**
 * Design gallery: the last look before the estimate is sent.
 *
 * The scope lines are supplied here rather than sitting on `GALLERY_ESTIMATE`
 * for the same reason they are props on the screen: the contract does not carry
 * them, and a sample that pretended otherwise would make an unpublished field
 * look settled. These three inclusions and two exclusions are the electrician
 * reference's own wording.
 */
export const metadata: Metadata = {
  title: "Estimate preview",
  robots: { index: false, follow: false },
};

const INCLUSIONS = [
  "Labour for every fitting listed above",
  "Testing on every point before I leave",
  "30-day warranty on the workmanship",
];

const EXCLUSIONS = [
  "Switches, sockets and other materials",
  "Wall cutting, chasing or repainting",
];

export default function EstimatePreviewGalleryPage() {
  return (
    <div className="min-h-screen bg-canvas py-8">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <EstimatePreviewScreen
          estimate={GALLERY_ESTIMATE}
          inclusions={INCLUSIONS}
          exclusions={EXCLUSIONS}
        />
      </div>
    </div>
  );
}
