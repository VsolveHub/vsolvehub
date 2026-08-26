import type { Metadata } from "next";

import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { ItemWiseScreen } from "@/features/proposal/view/item-wise-screen";

/**
 * Gallery: the item-wise estimate, one row open.
 *
 * Contract 1.43.0 cannot express an item-wise line, so there is no route to wire
 * this to yet. Rather than invent a DTO and ship a screen that pretends to be
 * live, the real component renders here against `GALLERY_ESTIMATE` at the exact
 * 390x844 the design was drawn at. When proposal 0015 publishes, the wired route
 * imports the same component and this page keeps working as the reference.
 *
 * Deliberately outside `PartnerShell`: the shell draws the navbar and tab bar
 * this screen exists to replace (FE-5 — a pushed task screen focuses, it does
 * not orient), and wrapping it here would show a chrome the artboard does not
 * have.
 */

export const metadata: Metadata = {
  title: "Item-wise estimate",
  // A design surface with sample money on it has no business in an index.
  robots: { index: false, follow: false },
};

export default function ItemWiseGalleryPage() {
  return (
    <div className="min-h-screen bg-canvas py-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <ItemWiseScreen estimate={GALLERY_ESTIMATE} openLineId="switch" />
      </div>
    </div>
  );
}
