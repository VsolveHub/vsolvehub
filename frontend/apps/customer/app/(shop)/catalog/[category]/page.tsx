import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@vsolve/ui";

import { CategoryVariantList } from "@/features/catalog/components/category-variant-list";
import { getCategory, getCategoryServiceDetails } from "@/features/catalog/queries";

type PageProps = {
  params: Promise<{ category: string }>;
};

/**
 * One trade, in full: every service in the category with every variant listed
 * under it — the priced A1 tasks with their starting prices, the A3 crew
 * variants at a day rate, the A5 projects priced on site. The catalogue's tile
 * answered "do you do this?"; this page answers "what exactly does that
 * include, and from how much?" in the artboards' rate-card shape.
 *
 * The old page here was a marketing screen — hero band, trust pillars,
 * subcategory chip filters over image cards. All of it is gone: a customer
 * arriving from the catalogue has already chosen the trade, and the only job
 * left is showing them the card.
 *
 * ## Literal `revalidate`
 *
 * Next statically analyses segment config; see catalog/page.tsx for the cache
 * policy discussion. The fan-out underneath carries the `catalog` tags, so a
 * publish still invalidates this page ahead of the timer.
 */
export const revalidate = 300;

/** Prerenders nothing so `next build` never depends on a reachable Django. */
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
      title: `${category.name} services — V Solve Hub`,
      description: category.description,
      type: "website",
    },
  };
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-36 w-full rounded-card" />
      ))}
    </div>
  );
}

async function CategoryServices({ slug }: { slug: string }) {
  const [category, services] = await Promise.all([
    getCategory(slug),
    getCategoryServiceDetails(slug),
  ]);

  if (category === null || services === null) notFound();

  return <CategoryVariantList category={category} services={services} />;
}

export default async function CategoryPage({ params }: PageProps) {
  const { category: slug } = await params;
  // Resolved before streaming so an unknown slug 404s rather than rendering a
  // heading for a category that does not exist.
  const category = await getCategory(slug);

  if (!category) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center gap-1 pb-3">
        <Link
          href="/catalog"
          aria-label="All services"
          className={[
            "flex size-11 shrink-0 items-center justify-center rounded-control",
            "text-text-secondary transition-colors duration-fast",
            "hover:bg-surface-hover hover:text-text",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          ].join(" ")}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="size-5"
          >
            <path d="M12.5 4.5 7 10l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-1 text-[19px] font-extrabold tracking-tight text-text">
          {category.name}
        </h1>
      </header>

      <Suspense fallback={<ListSkeleton />}>
        <CategoryServices slug={slug} />
      </Suspense>
    </main>
  );
}
