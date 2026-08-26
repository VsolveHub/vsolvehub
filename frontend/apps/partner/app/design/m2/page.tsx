import type { Metadata } from "next";
import Link from "next/link";

/**
 * The M2 estimate gallery index.
 *
 * WHY THIS ROUTE EXISTS: 22 of the 28 designed M2 screens have no contract
 * behind them — proposal 1.43.0 cannot express an item-wise line — so they are
 * rendered here against `GALLERY_ESTIMATE` fixed props instead of being wired
 * to a server that has nothing to say yet. It is a review surface for the
 * design, not a product route: nothing here reads a session, and nothing here
 * may ever be linked from a partner-facing screen.
 *
 * It is deliberately unindexed. A public gallery of half-built screens is the
 * kind of thing that ends up in a search result under the product's own name.
 *
 * Siblings land one at a time, so some of these links 404 until their screen is
 * built. That is preferred to hiding them: the list is the plan, and a missing
 * entry is harder to notice than a broken one.
 */

export const metadata: Metadata = {
  title: "M2 estimate screens",
  robots: { index: false, follow: false },
};

const SCREENS: readonly { slug: string; name: string; note: string }[] = [
  // The two screens before an estimate exists at all: answering the offer,
  // then waiting on the customer's payment.
  { slug: "offer", name: "Fixed-time offer", note: "The customer picked the time — accept or pass, nothing to schedule" },
  { slug: "held", name: "Held visit", note: "Won, but do not travel yet: the address unlocks when payment clears" },
  { slug: "mode", name: "Estimate mode", note: "Item wise or labour wise — asked once, before anything is typed" },
  { slug: "items", name: "Item list", note: "The priced ledger, grouped into sections with subtotals" },
  { slug: "quick-add", name: "Quick add", note: "The catalogue a partner taps rows in from" },
  { slug: "charges", name: "Charges", note: "Transport, loading, disposal — named codes only" },
  { slug: "labour", name: "Labour list", note: "Roles, crew size and working days" },
  { slug: "summary", name: "Money summary", note: "Taxable value, GST, commission and what reaches the partner" },
  { slug: "installments", name: "Installments", note: "Payment stages and what the customer has at the end of each" },
  { slug: "preview", name: "Estimate preview", note: "The document as the customer receives it" },
];

export default function M2GalleryIndexPage() {
  return (
    <div className="min-h-screen bg-canvas px-5 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Design gallery
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">M2 estimate screens</h1>
          <p className="text-sm leading-6 text-text-secondary">
            Each screen renders the real component with one fixed sample estimate, so the numbers
            cannot disagree with each other. Not wired to a server — no route here reads a session.
          </p>
        </header>

        <ul className="flex flex-col gap-2">
          {SCREENS.map((screen) => (
            <li key={screen.slug}>
              <Link
                href={`/design/m2/${screen.slug}`}
                className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold tracking-[-0.015em] text-text">
                    {screen.name}
                  </span>
                  <span className="mt-0.5 text-xs font-medium leading-5 text-text-muted">
                    {screen.note}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-text-link">
                  /{screen.slug}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
