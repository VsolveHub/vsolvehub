import {
  MaterialsListScreen,
  type ShoppingGroup,
} from "@/features/quotes/view/gallery/materials-list-screen";

/**
 * Design gallery only. Pure component, fixed sample values, no fetching — the
 * `supplied_by` field that splits a quote into labour and materials is requested
 * in proposal 0015 and is not published yet.
 *
 * ## Why the sample lives here and not in `lib/design-gallery/sample`
 *
 * That module holds ONE journey: Ravi Kumar's ₹1,52,810 bathroom project, where
 * the partner supplies the materials and their cost is already inside the price
 * the customer pays. Nothing on that quote is for the customer to buy. This
 * screen is the opposite arrangement — Ramesh Electricals quotes labour only —
 * and handing a customer a shopping list drawn from a quote that already covers
 * the goods would have them pay for the same fittings twice. Separate scenario,
 * separate data, and deliberately no import between them.
 *
 * The nine items here are the nine the breakdown screen's warning strip counts,
 * and ₹2,513 is that screen's total — the one figure this list is *not* part of.
 * Both pages are driven from the same literal numbers so the pair cannot drift.
 */
export const metadata = { title: "Materials — M2", robots: { index: false, follow: false } };

const GROUPS: readonly ShoppingGroup[] = [
  {
    id: "electrical",
    title: "Electrical shop",
    trade: "electrical",
    items: [
      {
        id: "modular-switch",
        name: "Modular switch",
        specification: "6A, white",
        quantity: "5 Nos",
      },
      {
        id: "modular-socket",
        name: "Modular socket",
        specification: "6A, 3-pin, white",
        quantity: "3 Nos",
      },
      {
        id: "ceiling-fan",
        name: "Ceiling fan",
        specification: "1200 mm, any brand",
        quantity: "2 Nos",
      },
      {
        id: "led-tube-light",
        name: "LED tube light",
        specification: "20 W, 4 ft, with batten",
        quantity: "4 Nos",
      },
      {
        id: "mcb",
        name: "MCB, single pole",
        specification: "16 A, C-curve",
        quantity: "1 No",
      },
      {
        id: "distribution-box",
        name: "Distribution box",
        specification: "8-way, single door",
        quantity: "1 No",
      },
    ],
  },
  {
    id: "hardware",
    title: "Hardware",
    trade: "hardware",
    items: [
      {
        id: "modular-plate",
        name: "Modular plate & box",
        specification: "2-module, to match switches",
        quantity: "8 Nos",
      },
      {
        // Sold by length, not by count — which is why the quantity carries its
        // own unit rather than the screen appending "Nos" to every number.
        id: "pvc-casing",
        name: "PVC casing",
        specification: "1 inch",
        quantity: "10 ft",
      },
      {
        id: "consumables",
        name: "Screws, clips & tape",
        specification: "Assorted",
        quantity: "1 set",
      },
    ],
  },
];

export default function MaterialsListPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <MaterialsListScreen
          title="Materials to buy"
          partnerFirstName="Ramesh"
          quoteTotalPaise={2513 * 100}
          groups={GROUPS}
          workHref="/design/m2/breakdown"
        />
      </div>
    </main>
  );
}
