import type { Metadata } from "next";
import Link from "next/link";

import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { EstimateModeScreen } from "@/features/proposal/view/estimate-mode-screen";

/**
 * `EstimateModeScreen` at artboard size.
 *
 * No `PartnerShell` and no workspace gate: the shell would draw the navbar and
 * tabs this screen exists to replace, and there is no session to gate on. The
 * fixed 390x844 frame is the point — the screen is designed for a phone, and
 * reviewing it full-bleed on a desktop hides every spacing decision in it.
 */

export const metadata: Metadata = {
  title: "Estimate mode — M2",
  robots: { index: false, follow: false },
};

export default function EstimateModeGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-canvas px-4 py-8">
      <Link
        href="/design/m2"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-text-link"
      >
        ← All M2 screens
      </Link>

      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <EstimateModeScreen estimate={GALLERY_ESTIMATE} selectedMode={GALLERY_ESTIMATE.mode} />
      </div>
    </div>
  );
}
