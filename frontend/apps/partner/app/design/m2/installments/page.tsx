import type { Metadata } from "next";

import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { InstallmentsScreen } from "@/features/proposal/view/installments-screen";

/**
 * Design gallery: the installments editor, second stage open.
 *
 * `openInstallmentId="i2"` because the open row is the whole point of the
 * design — collapsed, this screen is a list, and the artboard is about what one
 * stage looks like while it is being priced. Sample data only; see the note on
 * `GALLERY_ESTIMATE`.
 */
export const metadata: Metadata = {
  title: "Payment installments",
  robots: { index: false, follow: false },
};

export default function InstallmentsGalleryPage() {
  return (
    <div className="min-h-screen bg-canvas py-8">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <InstallmentsScreen estimate={GALLERY_ESTIMATE} openInstallmentId="i2" />
      </div>
    </div>
  );
}
