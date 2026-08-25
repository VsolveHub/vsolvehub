import type { Metadata } from "next";
import Link from "next/link";

import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { ChargesScreen } from "@/features/proposal/view/charges-screen";

/**
 * `ChargesScreen` at artboard size.
 *
 * No `PartnerShell` and no workspace gate: the shell would draw the navbar and
 * tabs this screen exists to replace, and there is no session to gate on. The
 * fixed 390x844 frame is the point — the screen is designed for a phone, and
 * reviewing it full-bleed on a desktop hides every spacing decision in it.
 *
 * `openChargeId="loading"` opens the "Loading & unloading" charge, which is the
 * state worth reviewing: it is the only one that shows the controlled vocabulary,
 * and the vocabulary is the reason this screen exists.
 */

export const metadata: Metadata = {
  title: "Charges — M2",
  robots: { index: false, follow: false },
};

export default function ChargesGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-canvas px-4 py-8">
      <Link
        href="/design/m2"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-text-link"
      >
        ← All M2 screens
      </Link>

      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <ChargesScreen estimate={GALLERY_ESTIMATE} openChargeId="loading" />
      </div>
    </div>
  );
}
