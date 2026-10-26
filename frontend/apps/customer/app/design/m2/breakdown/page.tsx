import {
  QuoteBreakdownScreen,
  type BreakdownSection,
} from "@/features/quotes/view/gallery/quote-breakdown-screen";

/**
 * Design gallery only. Pure component, fixed sample values, no fetching — the
 * `supplied_by` field this screen turns on is requested in proposal 0015 and is
 * not published yet.
 *
 * ## Why the sample lives here and not in `lib/design-gallery/sample`
 *
 * That module holds ONE journey: Ravi Kumar's ₹1,52,810 bathroom project, where
 * the partner supplies the materials and they sit inside the price. This screen
 * is the opposite arrangement — Ramesh Electricals quotes labour only and the
 * customer buys the fittings — and the two must not be mixed, because a total
 * that includes materials shown beside a list of materials to buy asks the
 * customer to pay for the same switches twice. Separate scenario, separate data.
 *
 * ## The arithmetic, verified
 *
 *   Wiring & points   400 + 300              =   700
 *   Fixtures          300 + 480              =   780
 *   Panel & safety    150 + 200              =   350
 *   ────────────────────────────────────────────────
 *   Labour            700 + 780 + 350        = 1,830
 *   Charges           200 + 100              =   300
 *   Taxable           1,830 + 300            = 2,130
 *   GST 18%           2,130 × 0.18 = 383.40  →   383
 *   You pay           2,130 + 383            = 2,513
 *
 * Amounts are paise, so the screen formats and never computes; the subtotals are
 * stated rather than summed, which is what lets the numbers above be checked by
 * eye against the rows they sit over.
 */
export const metadata = { title: "Quote breakdown — M2", robots: { index: false, follow: false } };

const RUPEE = 100;

const SECTIONS: readonly BreakdownSection[] = [
  {
    id: "wiring",
    title: "Wiring & points",
    subtotalPaise: 700 * RUPEE,
    lines: [
      {
        id: "switch-6a",
        label: "Switch (6A) — fitting",
        quantity: "5 Nos × ₹80",
        amountPaise: 400 * RUPEE,
      },
      {
        id: "socket-6a",
        label: "Socket (6A) — fitting",
        quantity: "3 Nos × ₹100",
        amountPaise: 300 * RUPEE,
      },
    ],
  },
  {
    id: "fixtures",
    title: "Fixtures",
    subtotalPaise: 780 * RUPEE,
    lines: [
      {
        id: "fan",
        label: "Fan — installation",
        quantity: "2 Nos × ₹150",
        amountPaise: 300 * RUPEE,
      },
      {
        id: "tube-light",
        label: "Tube light / LED — fitting",
        quantity: "4 Nos × ₹120",
        amountPaise: 480 * RUPEE,
      },
    ],
  },
  {
    id: "panel",
    title: "Panel & safety",
    subtotalPaise: 350 * RUPEE,
    lines: [
      {
        id: "mcb",
        label: "MCB (single pole)",
        quantity: "1 No × ₹150",
        amountPaise: 150 * RUPEE,
      },
      {
        id: "db-box",
        label: "DB box — fitting",
        quantity: "1 No × ₹200",
        amountPaise: 200 * RUPEE,
      },
    ],
  },
  {
    // No per-unit line: transport is a flat charge, and inventing "1 No × ₹200"
    // for it would imply a rate that could be argued over.
    id: "charges",
    title: "Charges",
    subtotalPaise: 300 * RUPEE,
    lines: [
      { id: "transport", label: "Transportation", amountPaise: 200 * RUPEE },
      { id: "loading", label: "Loading & unloading", amountPaise: 100 * RUPEE },
    ],
  },
];

export default function QuoteBreakdownPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <QuoteBreakdownScreen
          partnerName="Ramesh Electricals"
          modeLabel="Item-wise"
          materialCount={9}
          sections={SECTIONS}
          labourPaise={1830 * RUPEE}
          chargesPaise={300 * RUPEE}
          taxLabel="GST 18%"
          taxPaise={383 * RUPEE}
          totalPaise={2513 * RUPEE}
          materialsHref="/design/m2/materials"
        />
      </div>
    </main>
  );
}
