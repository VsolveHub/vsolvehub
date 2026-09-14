import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@vsolve/ui";
import { ChevronLeft } from "lucide-react";

import { CategoryTileBrowser } from "@/features/catalog/components/category-tile-browser";
import { getCategory, getCategoryServices } from "@/features/catalog/queries";
import { isCareerJobsCategory, LISTINGS_HREF } from "@/lib/routes";

type PageProps = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ tile?: string }>;
};

/**
 * One trade, opened directly on the service list (first tile when none is selected).
 * Career/Jobs (A10) redirects to the listing surface — not area-priced bookables.
 */
export const revalidate = 300;

export function generateStaticParams(): { category: string }[] {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug } = await params;
  if (isCareerJobsCategory(slug)) {
    return {
      title: "Career & job openings",
      alternates: { canonical: LISTINGS_HREF },
    };
  }
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

  // A10 Career/Jobs: catalogue taxonomy entry → listing browse (plan: career-jobs → /listings).
  if (isCareerJobsCategory(slug)) {
    redirect(LISTINGS_HREF);
  }

  const category = await getCategory(slug);

  if (!category) notFound();

  const tileSlug = typeof tile === "string" && tile !== "" ? tile : null;

  return (
    <main className="mx-auto w-full max-w-[1360px] px-2 sm:px-4 md:px-6 pt-2 pb-1 h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      <header className="lg:hidden shrink-0 flex items-center gap-1 pb-2">
        <Link
          href="/"
          aria-label="Back to home"
          className="inline-flex min-h-9 items-center gap-1 text-xs sm:text-sm font-bold text-signal-700 hover:text-signal-800 transition-colors"
        >
          <ChevronLeft className="size-4 shrink-0" strokeWidth={2.5} />
          <span>Home</span>
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-1 text-[19px] font-extrabold tracking-tight text-text">
          {category.name}
        </h1>
      </header>

      <div className="min-h-0 flex-1 flex flex-col">
        <Suspense fallback={<ListSkeleton />}>
          <CategoryServices slug={slug} tile={tileSlug} />
        </Suspense>
      </div>
    </main>
  );
}
