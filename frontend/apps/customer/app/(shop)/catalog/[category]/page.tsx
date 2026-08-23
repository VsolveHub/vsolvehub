import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@vsolve/ui";

import { getCategory, getCategoryServices, type Category } from "@/features/catalog/queries";
import { groupServicesBySubcategory } from "@/features/catalog/grouping";
import { ServiceCard } from "@/features/catalog/components/service-card";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";
import { WorkforceCatalog } from "@/features/catalog/components/workforce-catalog";

type PageProps = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ trade?: string | string[], q?: string | string[] }>;
};

const CHIP_CLASS =
  "group relative inline-flex h-[3.25rem] shrink-0 snap-start items-center justify-center rounded-[1rem] bg-white px-6 whitespace-nowrap text-[0.95rem] font-medium text-text-secondary shadow-sm transition-all duration-300 hover:bg-navy-50 hover:text-navy-900 hover:-translate-y-[2px] hover:shadow-md border border-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";
const CHIP_ACTIVE_CLASS =
  "group relative inline-flex h-[3.25rem] shrink-0 snap-start items-center justify-center rounded-[1rem] bg-gradient-to-br from-navy-900 to-navy-800 px-6 whitespace-nowrap text-[0.95rem] font-bold text-white shadow-md transition-all duration-300 border border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

/** Literal because Next statically analyses segment config; see catalog/page.tsx. */
export const revalidate = 300;

/**
 * Deliberately prerenders nothing.
 *
 * Returning the category list here made `next build` depend on a reachable
 * Django: when the API blipped, the build failed part-way through prerendering
 * with a fetch stack trace that reads like a frontend defect. That happened
 * three times in one working session.
 *
 * `catalog/page.tsx` already states the rule this follows — a frontend build
 * must not require a live backend — and enforces it with `connection()`. The
 * same rule applies here; the mechanism differs only because this route opts
 * into prerendering through `generateStaticParams`, so opting out means
 * returning nothing.
 *
 * Nothing is lost in steady state. `dynamicParams` defaults to true, so every
 * category still renders on demand and is then cached for `revalidate`
 * seconds — the same five minutes a prerendered page would have used. The only
 * cost is the first request after a deploy.
 */
export function generateStaticParams(): { category: string }[] {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategory(slug);

  if (!category) return { title: "Category not found" };

  return {
    title: `${category.name} services`,
    description: category.description,
    alternates: { canonical: `/catalog/${category.slug}` },
    openGraph: {
      title: `${category.name} services — Vsolve Hub`,
      description: category.description,
      type: "website",
    },
  };
}

function ServiceGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className={`w-full ${index === 0 ? "h-64 sm:col-span-2" : "h-48 sm:col-span-1"}`} />
      ))}
    </div>
  );
}

function TrustStandard() {
  return (
    <section className="bg-[#F2EFEA] py-20 mt-16 border-t border-line/50">
      <div className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-[2rem] font-extrabold text-navy-900 mb-16 tracking-tight">The V Solve Hub Standard</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          <div className="flex flex-col items-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#EBF0FE] text-navy-900 mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-navy-900 mb-3">Vetted Professionals</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              Every technician undergoes strict background checks and skills assessments before joining.
            </p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#EBF0FE] text-navy-900 mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zM7 7h10v2H7V7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-navy-900 mb-3">Transparent Pricing</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              No hidden fees. You know exactly what you&apos;ll pay before the service begins.
            </p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#EBF0FE] text-navy-900 mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-navy-900 mb-3">Quality Guarantee</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              We stand by our work. If it&apos;s not right, we&apos;ll fix it at no extra cost to you.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

async function WorkforceGrid({
  category,
  activeTrade,
  query,
}: {
  category: Category;
  activeTrade: string | null;
  query: string | null;
}) {
  let services = await getCategoryServices(category.slug);
  if (services === null) notFound();
  
  if (query) {
    services = services.filter((s) => 
      s.name.toLowerCase().includes(query) || 
      (s.short_description && s.short_description.toLowerCase().includes(query))
    );
  }

  return <WorkforceCatalog category={category} services={services} activeTrade={activeTrade} />;
}

/**
 * The category's services, grouped under the subcategory each one belongs to.
 *
 * This used to render every service in one flat grid while the subcategory chips linked to
 * `#<slug>` — anchors that existed nowhere on the page. Clicking "Septic Tank Services" moved
 * nothing and left all sixty-two Home services on screen, which read as the filter being broken
 * because, functionally, there was no filter at all.
 *
 * Both halves are fixed, and they are deliberately different mechanisms:
 *
 * * Each group is a `<section id>`, so `#septic-tank-services` finally has something to scroll
 *   to. A hash never reaches the server, so it can only ever be a jump link — filtering on one
 *   would mean shipping the whole list and hiding most of it in the browser.
 * * The chips filter through `?trade=`, which the server can read. One subcategory's services
 *   are rendered and the rest are not sent at all, and the result is a URL that survives being
 *   shared or reloaded.
 *
 * Grouping is done here rather than asked of the API because `ServiceCard` already carries
 * `subcategory_slug`; a second endpoint would be a second source of truth for the same answer.
 */
async function ServiceGrid({
  categorySlug,
  subcategories,
  activeTrade,
  query,
}: {
  categorySlug: string;
  subcategories: Category["subcategories"];
  activeTrade: string | null;
  query: string | null;
}) {
  let services = await getCategoryServices(categorySlug);

  if (services === null) notFound();

  if (query) {
    services = services.filter((s) => 
      s.name.toLowerCase().includes(query) || 
      (s.short_description && s.short_description.toLowerCase().includes(query))
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        title="No services in this category yet"
        description="We are still adding services here. Try another category in the meantime."
      />
    );
  }

  const { groups, ungrouped } = groupServicesBySubcategory(services, subcategories, activeTrade);

  // A filter that matches no subcategory at all — a stale link, or a hand-typed slug. Said
  // plainly rather than quietly falling back to the full list, which would look like the filter
  // being ignored, which is the bug this replaced.
  if (activeTrade !== null && groups.length === 0) {
    return (
      <EmptyState
        title="That group is not in this category"
        description="It may have been renamed or moved. Browse the full category instead."
      />
    );
  }

  return (
    <div className="space-y-10 sm:space-y-12">
      {groups.map(({ subcategory, services: grouped }) => (
        // `scroll-mt` so a `#slug` landing does not tuck the heading under the sticky header.
        <section key={subcategory.id} id={subcategory.slug} className="scroll-mt-24">
          <div className="mb-6 flex items-end justify-between gap-3 border-b border-line/70 pb-4">
            <h2 className="text-[1.75rem] font-bold tracking-tight text-navy-900">
              {subcategory.name}
            </h2>
            <p className="shrink-0 text-[0.85rem] font-medium text-text-secondary">
              {grouped.length} {grouped.length === 1 ? "service" : "services"}
            </p>
          </div>
          {grouped.length === 0 ? (
            <EmptyState
              title="No services here yet"
              description="We are still adding services to this group."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map((service, index) => (
                <ServiceCard key={service.id} service={service} categorySlug={categorySlug} index={index} />
              ))}
            </div>
          )}
        </section>
      ))}

      {ungrouped.length > 0 ? (
        <section>
          <div className="mb-6 flex items-end justify-between gap-3 border-b border-line/70 pb-4">
            <h2 className="text-[1.75rem] font-bold tracking-tight text-navy-900">
              More in this category
            </h2>
            <p className="shrink-0 text-[0.85rem] font-medium text-text-secondary">
              {ungrouped.length} {ungrouped.length === 1 ? "service" : "services"}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ungrouped.map((service, index) => (
              <ServiceCard key={service.id} service={service} categorySlug={categorySlug} index={index} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { category: slug } = await params;
  const { trade, q } = await searchParams;
  const category = await getCategory(slug);
  // A repeated `?trade=a&trade=b` arrives as an array. Refused rather than picking one, because
  // guessing which the caller meant is how a filter starts lying about what it applied.
  const activeTrade = typeof trade === "string" && trade !== "" ? trade : null;
  const query = typeof q === "string" && q.trim() !== "" ? q.trim().toLowerCase() : null;

  // Resolved before streaming so an unknown slug 404s rather than rendering a
  // heading for a category that does not exist.
  if (!category) notFound();

  if (category.slug === "workforce-and-projects") {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <Breadcrumbs
          trail={[
            { label: "Services", href: "/catalog" },
            { label: category.name, href: `/catalog/${category.slug}` },
          ]}
        />
        <Suspense key={`${activeTrade ?? "all"}-${query ?? ""}`} fallback={<ServiceGridSkeleton />}>
          <WorkforceGrid category={category} activeTrade={activeTrade} query={query} />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="bg-[#FAF9F7] min-h-screen pt-4 pb-0">
      <div className="mx-auto w-full max-w-[1216px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-black text-navy-900 bg-white border border-[#e7e2da] px-4 py-2.5 rounded-full shadow-2xs hover:shadow-sm hover:border-[#EA580C] hover:text-[#EA580C] transition-all duration-300 cursor-pointer"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5 rotate-180">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            Back to Home
          </Link>
        </div>

        <Breadcrumbs
          trail={[
            { label: "Services", href: "/catalog" },
            { label: category.name, href: `/catalog/${category.slug}` },
          ]}
        />

        <header className="max-w-3xl pb-6 pt-6 sm:pb-8 sm:pt-8 hidden">
          {/* We hide this header because the design incorporates the category name into the group headers,
              but we keep it accessible for screen readers if necessary, or simply rely on breadcrumbs. 
              Actually, the design shows subcategory chips right below breadcrumbs. */}
        </header>

      {category.subcategories.length > 0 ? (
        <nav aria-label="Subcategories" className="-mx-4 mb-10 sm:mx-0">
          <ul className="flex gap-3 overflow-x-auto px-4 sm:px-1 pb-4 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory [&::-webkit-scrollbar]:hidden">
            <li>
              {/* Present only once a filter is on. A permanent "All" on an unfiltered page is a
                  control that does nothing, and the state it would show is already on screen. */}
              {activeTrade !== null ? (
                <Link href={`/catalog/${category.slug}`} className={CHIP_CLASS}>
                  All {category.name}
                </Link>
              ) : null}
            </li>
            {category.subcategories.map((sub) => {
              const isActive = sub.slug === activeTrade;
              return (
                <li key={sub.id}>
                  <Link
                    href={`/catalog/${category.slug}?trade=${sub.slug}`}
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
                  >
                    {sub.name}
                    {isActive && (
                      <span className="ml-2 flex size-[1.125rem] items-center justify-center rounded-full bg-white/20">
                        <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* Failures propagate to error.tsx so a transient API outage is never
          cached as HTML for the length of the revalidate window. */}
      <Suspense key={`${activeTrade ?? "all"}-${query ?? ""}`} fallback={<ServiceGridSkeleton />}>
        <ServiceGrid
          categorySlug={category.slug}
          subcategories={category.subcategories}
          activeTrade={activeTrade}
          query={query}
        />
      </Suspense>
      
      </div>
      <TrustStandard />
    </main>
  );
}
