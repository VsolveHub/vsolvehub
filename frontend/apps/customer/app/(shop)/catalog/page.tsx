import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@vsolve/ui";

import {
  CategoryCard,
} from "@/features/catalog/components/category-card";
import { RecentlyViewedRail } from "@/features/catalog/components/recently-viewed-rail";
import { SearchResults } from "@/features/catalog/components/search-results";
import { getCategories, getServicesByCategory } from "@/features/catalog/queries";
import { rankCatalogMatches } from "@/features/catalog/search";
import { SearchInput } from "@/features/session/view/search-input";

export const metadata: Metadata = {
  title: "All services",
  description:
    "Book verified electricians, plumbers, cleaners and appliance technicians in Hyderabad. Transparent pricing, no call-out surprises.",
  alternates: { canonical: "/catalog" },
};

export const revalidate = 300;

function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: 6 }, (_, index) => {
        let spanClasses = "md:col-span-1 min-h-[16rem]";
        if (index === 0 || index === 3) {
          spanClasses = "md:col-span-2 min-h-[16rem]";
        }
        return (
          <div
            key={index}
            className={`rounded-card bg-surface-sunken animate-pulse ${spanClasses}`}
          />
        );
      })}
    </div>
  );
}

// Helper icons
const ICONS = {
  electrician: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-action" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  plumber: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-navy-700" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  technician: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-navy-700" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  ac: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-[#ffc8a5]" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5l-5 5M7 5l5 5M17 19l-5-5M7 19l5-5M22 12h-4M6 12H2M19.07 19.07l-2.83-2.83M7.76 7.76 4.93 4.93M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" />
    </svg>
  ),
  beautician: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-navy-700" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22C12 22 20 18 20 12C20 6 12 2 12 2C12 2 4 6 4 12C4 18 12 22 12 22Z" />
      <path d="M12 22V2" />
      <path d="M12 12H4" />
      <path d="M12 12H20" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-navy-700" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 10v9.5A2.5 2.5 0 0 0 5 22h14a2.5 2.5 0 0 0 2.5-2.5V10" />
      <path d="M12 15v7" />
      <path d="M16 22H8" />
      <path d="M4 12V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M8 8h8" />
    </svg>
  ),
  pet: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-navy-700" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.7.28 1.4.5 2 1.41-3.28 6-4.07 7-6.828Z" />
      <path d="M10.5 14.5c-1.619 0-2.932-1.35-3-3-.07-1.68 1.47-3 3-3s3.07 1.32 3 3c-.068 1.65-1.381 3-3 3Z" />
      <path d="M14 5.172C14 3.782 15.577 2.679 17.5 3c2.823.47 4.113 6.006 4 7-.08.7-.28 1.4-.5 2-1.41-3.28-6-4.07-7-6.828Z" />
      <path d="M13.5 14.5c1.619 0 2.932-1.35 3-3 .07-1.68-1.47-3-3-3s-3.07 1.32-3 3c.068 1.65 1.381 3 3 3Z" />
      <path d="M8 16.5c-2.76 0-5 2.24-5 5 0 1.2.66 2.1 1.7 2.5.64.24 1.35.24 2.1.24H17.2c.75 0 1.46 0 2.1-.24 1.04-.4 1.7-1.3 1.7-2.5 0-2.76-2.24-5-5-5-2.26 0-4.16 1.42-4.78 3.42C10.82 17.92 9.51 16.5 8 16.5Z" />
    </svg>
  ),
  default: (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-navy-700" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h11m-4-4 4 4-4 4" />
    </svg>
  ),
};

function getIconForIndex(index: number) {
  const icons = [ICONS.electrician, ICONS.plumber, ICONS.technician, ICONS.ac, ICONS.beautician, ICONS.home, ICONS.pet];
  return icons[index] || ICONS.default;
}

/** Published catalogue order — matches the bento layout slots below. */
const CATALOG_CATEGORY_ORDER = [
  "electrician",
  "plumber",
  "technician",
  "ac-services",
  "beautician",
  "home-services",
  "pet-services",
  "workforce-and-projects",
] as const;

function sortCatalogCategories<T extends { slug: string; name: string }>(categories: readonly T[]): T[] {
  return [...categories].sort((a, b) => {
    const aIndex = CATALOG_CATEGORY_ORDER.indexOf(a.slug as (typeof CATALOG_CATEGORY_ORDER)[number]);
    const bIndex = CATALOG_CATEGORY_ORDER.indexOf(b.slug as (typeof CATALOG_CATEGORY_ORDER)[number]);
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

/**
 * Search across the whole catalogue — services first, then trades.
 *
 * Separate from `CategoryGrid` rather than a filter inside it. The two are
 * different screens answering different questions: browsing is "what do you
 * do", searching is "do you do this". Filtering the browse tiles answered the
 * second question with the first one's furniture, and a search for a service we
 * offer under a trade whose *name* did not match returned nothing at all.
 */
async function CatalogSearch({ query }: { query: string }) {
  const categories = sortCatalogCategories(await getCategories());
  const servicesByCategory = await getServicesByCategory(categories);

  return (
    <SearchResults query={query} results={rankCatalogMatches(categories, servicesByCategory, query)} />
  );
}

async function CategoryGrid() {
  const categories = sortCatalogCategories(await getCategories());

  if (categories.length === 0) {
    return (
      <EmptyState
        title="No services are published yet"
        description="Our catalogue is being set up. Please check back shortly."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {categories.map((category, index) => {
        const subs = category.subcategories.slice(0, 3).map(sub => sub.name);

        if (index === 0) {
          // Large hero card (Electrician)
          return (
            <CategoryCard
              key={category.id}
              href={`/catalog/${category.slug}`}
              name={category.name}
              description={category.description}
              className="md:col-span-2 min-h-[22rem] md:min-h-[16rem] p-0 border-transparent md:border-line bg-transparent md:bg-white shadow-md md:shadow-card hover:-translate-y-0.5 hover:shadow-raised overflow-hidden relative group"
            >
              {/* Mobile Background Image */}
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center md:hidden" />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/50 to-transparent md:hidden" />

              <div className="flex flex-col md:flex-row h-full relative z-10">
                <div className="flex flex-1 flex-col p-6 md:p-8 justify-end md:justify-start">
                  <div className="flex items-center gap-3 mb-3 md:mb-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-white md:bg-transparent shadow-sm md:shadow-none text-navy-900 md:text-action">
                      {getIconForIndex(index)}
                    </div>
                    <h2 className="text-2xl font-bold text-white md:text-navy-900">{category.name}</h2>
                  </div>
                  <p className="text-sm leading-relaxed text-white/90 md:text-text-secondary max-w-sm mb-4 md:mb-0">
                    {category.description}
                  </p>
                  
                  {subs.length > 0 && (
                    <div className="flex flex-wrap gap-2 md:mt-6 mb-6 md:mb-0">
                      {subs.map(sub => (
                        <span key={sub} className="inline-flex rounded-full bg-white/20 md:bg-surface-sunken border border-white/30 md:border-transparent px-3 py-1.5 text-xs font-medium text-white md:text-text-secondary backdrop-blur-sm md:backdrop-blur-none">
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-auto md:pt-8 flex items-center justify-between md:justify-start text-sm font-bold text-white md:text-action transition-colors hover:text-[#9e552b]">
                    <span className="md:hidden">Starting at $95</span>
                    <span className="flex items-center">
                      View Details
                      <svg viewBox="0 0 20 20" fill="none" className="size-4 ml-1" aria-hidden="true">
                        <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="hidden md:block w-[45%] h-full">
                  <div className="w-full h-full m-4 ml-0 rounded-card overflow-hidden bg-navy-100">
                    <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center" />
                  </div>
                </div>
              </div>
            </CategoryCard>
          );
        }

        if (index === 3) {
          // Wide Dark Card (AC Services)
          return (
            <CategoryCard
              key={category.id}
              href={`/catalog/${category.slug}`}
              name={category.name}
              description={category.description}
              className="md:col-span-2 min-h-[22rem] md:min-h-[16rem] p-0 border-transparent shadow-md hover:-translate-y-0.5 hover:shadow-raised overflow-hidden relative group"
            >
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/50 to-navy-900/30 md:bg-navy-900/70" />
              <div className="relative flex flex-col p-6 md:p-8 h-full justify-end md:justify-center z-10">
                <div className="flex items-center gap-3 mb-3 md:mb-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-action text-white md:bg-transparent md:text-action">
                    {getIconForIndex(index)}
                  </div>
                  <h2 className="text-2xl font-bold text-white">{category.name}</h2>
                </div>
                <p className="text-sm leading-relaxed text-white/90 max-w-[320px] mb-4 md:mb-0">
                  {category.description}
                </p>

                {subs.length > 0 && (
                  <div className="flex md:hidden flex-wrap gap-2 mb-6">
                    {subs.map(sub => (
                      <span key={sub} className="inline-flex rounded-full bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                        {sub}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto md:mt-8 flex items-center justify-between md:justify-start gap-4">
                  <span className="hidden md:inline-flex items-center gap-1.5 rounded bg-action px-3 py-1.5 text-xs font-bold text-white shadow-sm">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                      <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                    </svg>
                    Verified Pros
                  </span>
                  <span className="md:hidden text-sm font-bold text-white">Starting at $85</span>
                  <span className="flex items-center text-sm font-bold text-white transition-colors hover:text-white/80">
                    View Details
                    <svg viewBox="0 0 20 20" fill="none" className="size-4 ml-1" aria-hidden="true">
                      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </div>
            </CategoryCard>
          );
        }

        // Standard Cards (1, 2, 4, 5, etc.)
        return (
          <CategoryCard
            key={category.id}
            href={`/catalog/${category.slug}`}
            name={category.name}
            description={category.description}
            className="md:col-span-1 min-h-[16rem] p-0 border border-line bg-white shadow-card hover:-translate-y-0.5 hover:shadow-raised flex flex-col group relative overflow-hidden"
          >
            {/* Focus state styling border on left */}
            {index === 4 && (
              <span className="absolute inset-y-0 left-0 w-1 bg-action rounded-l-card" />
            )}
            
            <div className="flex flex-col h-full p-6 md:p-8">
              <div className="flex items-start justify-between mb-5">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#EBF0FE]">
                  {getIconForIndex(index)}
                </div>
                <div className="flex size-8 items-center justify-center rounded-full bg-surface-sunken text-text-muted transition-all duration-200 group-hover:bg-action-surface group-hover:text-navy-900 group-hover:scale-105 group-hover:translate-x-0.5">
                  <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                    <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <h2 className="text-[1.35rem] font-bold text-navy-900 group-hover:text-navy-700 transition-colors mb-3">
                {category.name}
              </h2>
              <p className="text-[0.95rem] leading-relaxed text-text-secondary">
                {category.description}
              </p>
              
              <div className="mt-auto pt-6 border-t border-line/70 flex flex-col">
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted mb-3">
                  Common requests
                </span>
                <ul className="text-[0.875rem] font-medium text-navy-900 flex flex-col gap-2 list-none pl-1">
                  {subs.map(sub => (
                    <li key={sub} className="flex items-center gap-2 relative">
                      <span className="size-1.5 rounded-full bg-action shrink-0" />
                      {sub}
                    </li>
                  ))}
                  {subs.length === 0 && <li className="text-text-muted font-normal italic">View all subcategories</li>}
                </ul>
              </div>
            </div>
          </CategoryCard>
        );
      })}
    </div>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await connection();
  const { q } = await searchParams;
  // Kept in the reader's own casing: it is quoted back to them in the results
  // heading and in the "nothing matches" state. `rankCatalogMatches` normalises
  // it for matching, which is the only place case is irrelevant.
  const query = typeof q === "string" && q.trim() !== "" ? q.trim() : null;

  return (
    <main className="bg-[#FAF9F7] min-h-screen">
      <div className="mx-auto w-full max-w-[1216px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="max-w-3xl pb-8 sm:pb-12">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-action">Services Catalog</p>
          <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-navy-900 sm:text-[2.5rem]">
            Explore Professional Services
          </h1>
          <p className="mt-4 max-w-[600px] text-[1.05rem] leading-relaxed text-text-secondary">
            Verified professionals, priced up front. Choose a category below to view details
            on pricing, expected duration, and specific tasks our experts can handle for
            your home or business.
          </p>
          {/* Shown at every width. It was `md:hidden`, which left the desktop
              catalogue with no search at all — the header carries navigation
              links, not a search field, so above `md` there was no way to look
              anything up. */}
          <div className="mt-8 max-w-xl">
            <Suspense fallback={<div className="h-12 w-full rounded-full bg-surface-sunken animate-pulse" />}>
              <SearchInput />
            </Suspense>
          </div>
        </header>

        {query === null ? (
          <div className="flex flex-col gap-8">
            <RecentlyViewedRail />
            <Suspense fallback={<CategoryGridSkeleton />}>
              <CategoryGrid />
            </Suspense>
          </div>
        ) : (
          <Suspense key={query} fallback={<CategoryGridSkeleton />}>
            <CatalogSearch query={query} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
