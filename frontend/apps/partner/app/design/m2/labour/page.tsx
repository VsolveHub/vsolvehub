import type { Metadata } from "next";
import Link from "next/link";

import { formatMoney } from "@vsolve/ui";

import type { EstimateView } from "@/features/proposal/model/estimate-view";
import { GALLERY_ESTIMATE } from "@/features/proposal/model/gallery-sample";
import { LabourWiseScreen } from "@/features/proposal/view/labour-wise-screen";

/**
 * `LabourWiseScreen` at artboard size.
 *
 * No `PartnerShell` and no workspace gate: the shell would draw the navbar and
 * tabs this screen exists to replace, and there is no session to gate on. The
 * fixed 390x844 frame is the point — the screen is designed for a phone, and
 * reviewing it full-bleed on a desktop hides every spacing decision in it.
 *
 * ## Why the sample is local
 *
 * `GALLERY_ESTIMATE` is an item-wise electrician job: switches, fans, an MCB. A
 * labour-wise estimate has no item rows at all, so there is nothing in it to
 * reuse for these lines. Rather than add a second mode to the shared fixture and
 * make every other gallery route carry rows it does not render, the roles live
 * here — shaped as `EstimateSectionView`/`EstimateLineView`, so the screen's prop
 * type is exactly the one the wired route will pass.
 *
 * Everything else is spread from the shared fixture so the partner, the customer
 * and the document title cannot disagree with the neighbouring screens. The money
 * is re-derived rather than inherited, because 30,000 of labour against 2,130 of
 * items would otherwise leave a GST line from the wrong estimate on screen:
 *   30,000 labour + 300 charges = 30,300 taxable
 *   +18% GST 5,454              = 35,754 payable
 *   less 5% commission 1,515    = 34,239 received
 * `installments` and `materials` are emptied on purpose — a labour-wise estimate
 * has no item rows, so it has nothing for the customer to go and buy, and the
 * blocked reason inherited from the fixture ("Add payment installments before you
 * send.") stays true.
 *
 * NEVER import this from a real route. It is sample data, not a fallback.
 */

export const metadata: Metadata = {
  title: "Labour list — M2",
  robots: { index: false, follow: false },
};

/** Whole rupees to the display string. Money is integer paise everywhere else. */
const inRupees = (rupees: number): string => formatMoney(rupees * 100);

const LABOUR_ESTIMATE: EstimateView = {
  ...GALLERY_ESTIMATE,
  mode: "LABOUR_WISE",

  sections: [
    {
      id: "crew",
      title: "Teams and working days",
      subtotal: inRupees(30_000),
      lines: [
        {
          id: "electrician",
          name: "Electrician",
          qualifier: "Skilled",
          amount: inRupees(15_000),
          workings: `5 × 5 × ${inRupees(600)}`,
          // people × days × rate/day. `quantity` is the days; `members` is the
          // third dimension an item line does not have.
          unit: "day",
          quantity: "5",
          rate: inRupees(600),
          members: "5",
        },
        {
          id: "helper",
          name: "Helper",
          qualifier: "Unskilled",
          amount: inRupees(15_000),
          workings: `10 × 5 × ${inRupees(300)}`,
          unit: "day",
          quantity: "5",
          rate: inRupees(300),
          members: "10",
        },
      ],
    },
  ],

  totals: {
    ...GALLERY_ESTIMATE.totals,
    linesTotal: inRupees(30_000),
    chargesTotal: inRupees(300),
    taxableValue: inRupees(30_300),
    taxAmount: inRupees(5_454),
    customerTotal: inRupees(35_754),
    customerTotalInWords: "Thirty Five Thousand Seven Hundred Fifty Four Only",
    commissionAmount: `−${inRupees(1_515)}`,
    partnerReceives: inRupees(34_239),
  },

  installments: [],
  materials: [],
};

export default function LabourWiseGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-canvas px-4 py-8">
      <Link
        href="/design/m2"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-text-link"
      >
        ← All M2 screens
      </Link>

      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <LabourWiseScreen estimate={LABOUR_ESTIMATE} openLineId="helper" />
      </div>
    </div>
  );
}
