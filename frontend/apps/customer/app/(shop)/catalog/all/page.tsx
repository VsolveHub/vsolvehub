import type { Metadata } from "next";
import { connection } from "next/server";

import {
  CATALOGUE_SCROLL_MARGIN_CLASS,
  CATALOGUE_TOP_ID,
  CategoryRail,
} from "@/features/catalog/icon-catalogue/category-rail";
import { groupServiceIndex } from "@/features/catalog/icon-catalogue/grouping";
import { getServiceIndex } from "@/features/catalog/icon-catalogue/queries";
import { ServiceGrid } from "@/features/catalog/icon-catalogue/service-grid";

/**
 * The whole catalogue on one page.
 *
 * `/catalog` merchandises: hero categories, a search box, recently viewed. This
 * is the other thing a catalogue has to be — the flat index, where a customer
 * who already knows the words "gas refill" finds them by scrolling rather than
 * by guessing which of six categories Operations filed them under.
 *
 * It sits alongside the merchandised page rather than replacing it. Both are
 * reachable, both are cheap, and this one is the honest answer to "what do you
 * actually do?".
 *
 * ## No route-level `revalidate`
 *
 * The single fetch underneath carries the catalogue cache policy and the
 * `catalog` tag already, so a publish invalidates this page through the same
 * path as every other public read. Repeating a literal here would be a second
 * number to keep in step with `CATALOG_REVALIDATE_SECONDS` — and the two
 * disagreeing is how a page serves five-minute-old data that the data cache
 * already refreshed.
 *
 * ## Why `connection()`
 *
 * A frontend build must not require a live backend. That rule is stated on
 * `catalog/page.tsx` and enforced the same way there; without it this route
 * prerenders at build time, and a Django that is merely asleep fails the whole
 * build with a fetch stack trace that reads like a frontend defect. This was
 * verified rather than assumed — the first build of this page did exactly that.
 *
 * Nothing is lost in steady state: the page renders on the first request after
 * a deploy and is then cached for `CATALOG_REVALIDATE_SECONDS`, which is what a
 * prerender would have given anyway.
 */

export const metadata: Metadata = {
  title: "All services",
  description:
    "The complete Vsolve Hub catalogue — every electrical, plumbing, appliance, cleaning, beauty and pet service we publish, grouped by trade.",
  alternates: { canonical: "/catalog/all" },
};

export default async function AllServicesPage() {
  await connection();

  const index = await getServiceIndex();
  const categories = groupServiceIndex(index);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header
        // What the rail's "All" chip returns to. The offset is the rail's own
        // constant so the two cannot disagree about how much chrome is stacked
        // above a jump target.
        id={CATALOGUE_TOP_ID}
        className={`mb-4 flex items-baseline gap-3 ${CATALOGUE_SCROLL_MARGIN_CLASS}`}
      >
        <h1 className="flex-1 text-xl font-extrabold tracking-tight text-text">All services</h1>
        {index.length > 0 ? (
          <p className="shrink-0 text-xs font-bold text-text-muted">
            {index.length === 1 ? "1 service" : `${index.length} services`}
          </p>
        ) : null}
      </header>

      {/* Between the heading and the grid, so it is the next thing a keyboard
          reaches and the next thing a screen reader hears — an accelerator
          offered before the list it accelerates, never instead of it. Every
          service below stays reachable by scrolling; nothing here filters. */}
      <CategoryRail categories={categories} />

      <div className="pt-5">
        <ServiceGrid categories={categories} />
      </div>
    </main>
  );
}
