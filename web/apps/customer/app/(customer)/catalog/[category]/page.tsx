import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@vsolve/ui";

import { getCategories, getCategory, getCategoryServices } from "@/features/catalog/queries";
import { ServiceCard } from "@/features/catalog/components/service-card";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";

type PageProps = { params: Promise<{ category: string }> };

/** Literal because Next statically analyses segment config; see catalog/page.tsx. */
export const revalidate = 300;

/**
 * Pre-renders every category at build time. The set is small and changes rarely,
 * so the whole category tier can be static; `revalidate` keeps it current.
 */
export async function generateStaticParams() {
  try {
    const categories = await getCategories();
    return categories.map((category) => ({ category: category.slug }));
  } catch (error) {
    // A build must not fail because the API was briefly unreachable — returning
    // nothing falls back to on-demand rendering, which still serves correct
    // pages. But it silently loses every prerendered category, so it is logged
    // loudly: a deploy that quietly stopped prerendering is exactly the kind of
    // regression nobody notices until the latency graph moves.
    console.error(
      "[catalog] Could not reach the API during build; no categories were prerendered. " +
        "All category pages will render on demand.",
      error,
    );
    return [];
  }
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

async function ServiceGrid({ categorySlug }: { categorySlug: string }) {
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

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} categorySlug={categorySlug} />
      ))}
    </div>
  );
}

export default async function CategoryPage({ params }: PageProps) {
  const { category: slug } = await params;
  const category = await getCategory(slug);

  // Resolved before streaming so an unknown slug 404s rather than rendering a
  // heading for a category that does not exist.
  if (!category) notFound();

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
            {category.subcategories.map((sub) => (
              <li key={sub.id}>
                <Link
                  href={`/catalog/${category.slug}#${sub.slug}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-text hover:border-line-strong hover:bg-surface-hover"
                >
                  {sub.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {/* Failures propagate to error.tsx so a transient API outage is never
          cached as HTML for the length of the revalidate window. */}
      <Suspense fallback={<ServiceGridSkeleton />}>
        <ServiceGrid categorySlug={category.slug} />
      </Suspense>
    </main>
  );
}
