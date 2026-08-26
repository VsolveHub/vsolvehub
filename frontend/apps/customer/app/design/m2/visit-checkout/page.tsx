import type { Metadata } from "next";

import { VisitCheckoutScreen } from "@/features/access/view/gallery/visit-checkout-screen";
import {
  SAMPLE_CHOSEN_PLAN,
  SAMPLE_PARTNER,
  SAMPLE_VISITS,
} from "@/lib/design-gallery/sample";

/**
 * `VisitCheckoutScreen` at artboard size.
 *
 * No auth and no app chrome of its own: there is no session to gate on and the
 * screen supplies its own header, scroll region and dock.
 *
 * The hold is the first sample visit — the one a professional has accepted — so
 * the countdown, the name and the slot on this screen are the same three values
 * `/design/m2/matching` shows on its held card. Credits are zero and the amount
 * due is therefore the plan price itself, taken from the same constant rather
 * than retyped, because a total that disagrees with its own rows is the defect
 * this shared fixture exists to prevent.
 *
 * NEVER import the sample from a real route. It is sample data, not a fallback.
 */

export const metadata: Metadata = {
  title: "Visit checkout — M2",
  robots: { index: false, follow: false },
};

const HELD_VISIT = SAMPLE_VISITS[0];

export default function VisitCheckoutGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-8">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <VisitCheckoutScreen
          hold={{
            remaining: HELD_VISIT.holdRemaining,
            professionalName: SAMPLE_PARTNER.shortName,
            day: HELD_VISIT.day,
            window: HELD_VISIT.window,
          }}
          plan={{
            planSize: SAMPLE_CHOSEN_PLAN.planSize,
            planPriceLabel: SAMPLE_CHOSEN_PLAN.priceLabel,
            creditsLabel: "−₹0",
            amountDueLabel: SAMPLE_CHOSEN_PLAN.priceLabel,
          }}
          selectedMethod="UPI"
        />
      </div>
    </div>
  );
}
