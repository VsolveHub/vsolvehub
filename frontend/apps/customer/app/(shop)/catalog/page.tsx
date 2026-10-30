import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { CatalogCategoryRows } from "@/features/catalog/components/catalog-category-rows";
import { SearchResults } from "@/features/catalog/components/search-results";
import { CatalogueHeader } from "@/features/catalog/icon-catalogue/catalogue-header";
import { getCategories, getServicesByCategory } from "@/features/catalog/queries";
import { rankCatalogMatches } from "@/features/catalog/search";

/**
 * The service catalogue, progressively disclosed by category.
 *
 * The default page shows one image-led row of subcategories per main category.
 * It does not download or render the hundreds of services and variants beneath
 * them. A subcategory opens the existing narrowed category route; "See all"
 * opens that category's complete subcategory grid. Search remains an explicit
 * accelerator and may return individual services because the customer asked
 * for one by name.
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
  title: "All Home Services in Hyderabad",
  description:
    "Browse every home service on V Solve Hub in Hyderabad — electricians, plumbers, AC repair, cleaning, beauty, pet care, construction and events. See prices before you book.",
  alternates: { canonical: "/catalog" },
};

async function Catalogue() {
  const categories = await getCategories();
  return <CatalogCategoryRows categories={categories} />;
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
    <div className="flex flex-col gap-8 pt-4">
      {Array.from({ length: 3 }, (_, row) => (
        <section key={row} className="animate-pulse motion-reduce:animate-none">
          <div className="mb-3 h-11 border-b border-line/70">
            <div className="h-5 w-32 rounded-control bg-surface-sunken" />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, tile) => (
              <div
                key={tile}
                className={`${previewSkeletonVisibility(tile)} flex-col gap-2`}
              >
                <div className="aspect-square rounded-card bg-surface-sunken" />
                <div className="mx-auto h-3 w-4/5 rounded-control bg-surface-sunken" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function previewSkeletonVisibility(index: number): string {
  if (index < 3) return "flex";
  if (index === 3) return "hidden sm:flex";
  return "hidden lg:flex";
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
