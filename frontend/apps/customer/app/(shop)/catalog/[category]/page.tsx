import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@vsolve/ui";
import { ChevronLeft } from "lucide-react";

import { CategoryTileBrowser } from "@/features/catalog/components/category-tile-browser";
import { getCategory, getCategoryServices } from "@/features/catalog/queries";

type PageProps = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ tile?: string }>;
};

/**
 * One trade, browsed with vertical category sidebar and sub-services cards.
 */
export const revalidate = 300;

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

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <Skeleton className="aspect-square w-full rounded-card" />
          <Skeleton className="h-3.5 w-4/5 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex items-start gap-4">
      <div className="w-24 sm:w-28 md:w-36 shrink-0 flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
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
  const category = await getCategory(slug);

  if (!category) notFound();

  let tileSlug = typeof tile === "string" && tile !== "" ? tile : null;
  if (category.slug === "rooms-pg-hostel" && tileSlug === null) {
    tileSlug = "rooms";
  }

  if (tileSlug === null) {
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
            <ChevronLeft className="size-5 shrink-0" strokeWidth={2.5} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate px-1 text-[19px] font-extrabold tracking-tight text-text">
            {category.name}
          </h1>
        </header>

        <Suspense fallback={<GridSkeleton />}>
          <CategoryServices slug={slug} tile={tileSlug} />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1360px] px-2 sm:px-4 md:px-6 pt-2 pb-1 h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      <header className="md:hidden shrink-0 flex items-center gap-1 pb-2">
        <Link
          href="/catalog"
          aria-label={`All ${category.name} services`}
          className="inline-flex min-h-9 items-center gap-1 text-xs sm:text-sm font-bold text-signal-700 hover:text-signal-800 transition-colors"
        >
          <ChevronLeft className="size-4 shrink-0" strokeWidth={2.5} />
          <span>All {category.name.toLowerCase()} services</span>
        </Link>
      </header>

      <div className="min-h-0 flex-1 flex flex-col">
        <Suspense fallback={<ListSkeleton />}>
          <CategoryServices slug={slug} tile={tileSlug} />
        </Suspense>
      </div>
    </main>
  );
}
