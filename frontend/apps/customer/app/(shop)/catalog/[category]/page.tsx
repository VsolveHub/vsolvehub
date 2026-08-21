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
  searchParams: Promise<{ trade?: string | string[] }>;
};

const CHIP_CLASS =
  "inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-text hover:border-line-strong hover:bg-surface-hover";
// Selected state borrows the same `action` + `signal-50` pair the checkout uses for a chosen
// option, so "this one is picked" looks the same wherever it appears.
const CHIP_ACTIVE_CLASS =
  "inline-flex min-h-11 items-center rounded-full border border-action bg-signal-50 px-4 text-sm font-semibold text-text";

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
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-36 w-full" />
      ))}
    </div>
  );
}

async function WorkforceGrid({
  category,
  activeTrade,
}: {
  category: Category;
  activeTrade: string | null;
}) {
  const services = await getCategoryServices(category.slug);
  if (services === null) notFound();
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
}: {
  categorySlug: string;
  subcategories: Category["subcategories"];
  activeTrade: string | null;
}) {
  const services = await getCategoryServices(categorySlug);

  if (services === null) notFound();

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
    <div className="space-y-10">
      {groups.map(({ subcategory, services: grouped }) => (
        // `scroll-mt` so a `#slug` landing does not tuck the heading under the sticky header.
        <section key={subcategory.id} id={subcategory.slug} className="scroll-mt-24">
          <h2 className="pb-3 text-lg font-bold text-text">{subcategory.name}</h2>
          {grouped.length === 0 ? (
            <EmptyState
              title="No services here yet"
              description="We are still adding services to this group."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {grouped.map((service) => (
                <ServiceCard key={service.id} service={service} categorySlug={categorySlug} />
              ))}
            </div>
          )}
        </section>
      ))}

      {ungrouped.length > 0 ? (
        <section>
          <h2 className="pb-3 text-lg font-bold text-text">More in this category</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {ungrouped.map((service) => (
              <ServiceCard key={service.id} service={service} categorySlug={categorySlug} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { category: slug } = await params;
  const { trade } = await searchParams;
  const category = await getCategory(slug);
  // A repeated `?trade=a&trade=b` arrives as an array. Refused rather than picking one, because
  // guessing which the caller meant is how a filter starts lying about what it applied.
  const activeTrade = typeof trade === "string" && trade !== "" ? trade : null;

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
        <Suspense key={activeTrade ?? "all"} fallback={<ServiceGridSkeleton />}>
          <WorkforceGrid category={category} activeTrade={activeTrade} />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        trail={[
          { label: "Services", href: "/catalog" },
          { label: category.name, href: `/catalog/${category.slug}` },
        ]}
      />

      <header className="pb-6 pt-3">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">{category.name}</h1>
        <p className="mt-2 max-w-prose text-text-secondary">{category.description}</p>
      </header>

      {category.subcategories.length > 0 ? (
        <nav aria-label="Subcategories" className="pb-6">
          <ul className="flex flex-wrap gap-2">
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
                    // `?trade=` rather than `#slug`: a hash never reaches the server, so it can
                    // only jump to a heading, never narrow what is rendered.
                    href={`/catalog/${category.slug}?trade=${sub.slug}`}
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
                  >
                    {sub.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* Failures propagate to error.tsx so a transient API outage is never
          cached as HTML for the length of the revalidate window. */}
      <Suspense key={activeTrade ?? "all"} fallback={<ServiceGridSkeleton />}>
        <ServiceGrid
          categorySlug={category.slug}
          subcategories={category.subcategories}
          activeTrade={activeTrade}
        />
      </Suspense>
    </main>
  );
}
