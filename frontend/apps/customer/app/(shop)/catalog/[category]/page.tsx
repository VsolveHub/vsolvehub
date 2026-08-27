import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@vsolve/ui";

import { CategoryTileBrowser } from "@/features/catalog/components/category-tile-browser";
import { getCategory, getCategoryServices } from "@/features/catalog/queries";

type PageProps = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ tile?: string }>;
};

/**
 * One trade, browsed the way a customer thinks (2026-08-26 owner decision).
 *
 * Two views on one URL: `/catalog/plumber` is the "Select a service" photo-tile
 * grid — the category's subcategories, each a picture and a name — and
 * `/catalog/plumber?tile=taps-showers` is that tile's own services with images
 * and honest price lines. Fixed-price, quote-priced and day-hire work all live
 * here side by side; the price line and the tap target say which is which.
 *
 * The previous page here listed every service with every variant expanded — a
 * rate card the customer had to read top to bottom before choosing anything.
 * That answered "what exactly does it cost?" before "which thing do I need?",
 * which is the wrong order on a phone.
 *
 * ## Literal `revalidate`
 *
 * Next statically analyses segment config; see catalog/page.tsx for the cache
 * policy discussion. The fan-out underneath carries the `catalog` tags, so a
 * publish still invalidates this page ahead of the timer. Reading
 * `searchParams` makes the route render per-request; the data reads underneath
 * stay in the Data Cache, so the tile filter costs no extra API traffic.
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
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <Skeleton className="aspect-square w-full rounded-card" />
          <Skeleton className="h-3.5 w-4/5 rounded-control" />
        </div>
      ))}
    </div>
  );
}

async function CategoryServices({ slug, tile }: { slug: string; tile: string | null }) {
  const [category, services] = await Promise.all([getCategory(slug), getCategoryServices(slug)]);

  if (category === null || services === null) notFound();

  return <CategoryTileBrowser category={category} services={services} activeTileSlug={tile} />;
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const [{ category: slug }, { tile }] = await Promise.all([params, searchParams]);
  // Resolved before streaming so an unknown slug 404s rather than rendering a
  // heading for a category that does not exist.
  const category = await getCategory(slug);

  if (!category) notFound();

  const tileSlug = typeof tile === "string" && tile !== "" ? tile : null;

  return (
    <main
      className={
        tileSlug
          ? "mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6 lg:mx-0 lg:max-w-none lg:p-0"
          : "mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6"
      }
    >
      <header className={tileSlug ? "flex items-center gap-1 pb-3 lg:hidden" : "flex items-center gap-1 pb-3"}>
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
        <CategoryServices slug={slug} tile={tileSlug} />
      </Suspense>
    </main>
  );
}
