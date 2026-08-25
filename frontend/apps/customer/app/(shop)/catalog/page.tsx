import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { SearchResults } from "@/features/catalog/components/search-results";
import { CategoryRail } from "@/features/catalog/icon-catalogue/category-rail";
import { CatalogueHeader } from "@/features/catalog/icon-catalogue/catalogue-header";
import { groupServiceIndex } from "@/features/catalog/icon-catalogue/grouping";
import { getServiceIndex } from "@/features/catalog/icon-catalogue/queries";
import { getServiceHrefs } from "@/features/catalog/icon-catalogue/service-links";
import { ServiceGrid } from "@/features/catalog/icon-catalogue/service-grid";
import { getCategories, getServicesByCategory } from "@/features/catalog/queries";
import { rankCatalogMatches } from "@/features/catalog/search";

/**
 * The services listing — the Catalogue screen from the M2 artboards.
 *
 * One page, every published service: an "All services" app bar with search
 * folded behind an icon, a category chip rail, then a section per trade with a
 * three-column grid of icon-and-name tiles. A customer picking "Full Bathroom
 * Plumbing" taps it here and lands directly in the quote brief; nobody first
 * chooses "Workforce & Projects", then "Interior Fit Out", then the service.
 * The old merchandised category cards, their stock photography and their
 * price copy are gone — this flat catalogue *is* the Services tab.
 *
 * Category pages (`/catalog/[category]`) and service pages survive for deep
 * links; they are simply no longer on the browsing path.
 *
 * ## No route-level `revalidate`
 *
 * Every fetch underneath carries the catalogue cache policy and the `catalog`
 * tag already, so a publish invalidates this page through the same path as
 * every other public read. Repeating a literal here would be a second number to
 * keep in step with `CATALOG_REVALIDATE_SECONDS` — and the two disagreeing is
 * how a page serves five-minute-old data that the data cache already refreshed.
 *
 * ## Why `connection()`
 *
 * A frontend build must not require a live backend. Without this the route
 * prerenders at build time, and a Django that is merely asleep fails the whole
 * build with a fetch stack trace that reads like a frontend defect. Nothing is
 * lost in steady state: the page renders on the first request after a deploy
 * and is then cached by the data-cache policy underneath.
 */

export const metadata: Metadata = {
  title: "All services",
  description:
    "The complete V Solve Hub catalogue — every electrical, plumbing, appliance, cleaning and project service we publish, grouped by trade.",
  alternates: { canonical: "/catalog" },
};

async function Catalogue() {
  // The index paints the grid; the href map decides where each tile goes. The
  // fan-out behind the map shares its cache entries with search and the
  // category pages, so this is not a second copy of the catalogue.
  const [index, hrefs] = await Promise.all([getServiceIndex(), getServiceHrefs()]);
  const categories = groupServiceIndex(index);

  return (
    <>
      <CategoryRail categories={categories} />
      <div className="pt-4">
        <ServiceGrid categories={categories} hrefs={hrefs} />
      </div>
    </>
  );
}

async function CatalogueSearchResults({ query }: { query: string }) {
  const categories = await getCategories();
  const servicesByCategory = await getServicesByCategory(categories);

  return (
    <SearchResults query={query} results={rankCatalogMatches(categories, servicesByCategory, query)} />
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2.5 pt-4 sm:grid-cols-4 md:grid-cols-6">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="min-h-24 animate-pulse rounded-card bg-surface-sunken" />
      ))}
    </div>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await connection();
  const { q } = await searchParams;
  // Kept in the reader's own casing: it is quoted back to them in the results
  // heading and in the "nothing matches" state. `rankCatalogMatches` normalises
  // it for matching, which is the only place case is irrelevant.
  const query = typeof q === "string" && q.trim() !== "" ? q.trim() : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      {/* `useSearchParams` inside; the boundary keeps the static shell honest. */}
      <Suspense fallback={<div className="h-11" />}>
        <CatalogueHeader />
      </Suspense>

      {query === null ? (
        <div className="pt-3">
          <Suspense fallback={<GridSkeleton />}>
            <Catalogue />
          </Suspense>
        </div>
      ) : (
        <div className="pt-3">
          <Suspense key={query} fallback={<GridSkeleton />}>
            <CatalogueSearchResults query={query} />
          </Suspense>
        </div>
      )}
    </main>
  );
}
