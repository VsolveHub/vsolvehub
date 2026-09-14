import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@vsolve/ui";

import { CategoryTileBrowser } from "@/features/catalog/components/category-tile-browser";
import { getCategory, getCategoryServices } from "@/features/catalog/queries";

import { StaysHero } from "./stays-hero";

/**
 * /stays — the marketing entry point for the Rooms/PG/Hostel/Hotels category.
 *
 * Wave C3 (Django_Next.js_Plan/M3/07-a9-stays-ux-overhaul-plan.md): this used
 * to be an entirely standalone, hardcoded page (93 fake "services," fake
 * prices, fake badge counts) whose every link collapsed to the same
 * `/catalog/rooms-pg-hostel?tile=rooms` URL regardless of what was clicked —
 * pure UX theater with no real filtering behind it. It now fetches the real
 * category and renders the same `CategoryTileBrowser` the standard catalog
 * route (`/catalog/rooms-pg-hostel`) uses, defaulting to the "rooms" tile
 * exactly as that route already does. The hero above it (branding, locality
 * search entry point, popular-locality shortcuts) is the part of the old
 * page that was genuinely useful and is kept — see ./stays-hero.tsx.
 */
export const revalidate = 300;

const CATEGORY_SLUG = "rooms-pg-hostel";
const DEFAULT_TILE = "rooms";

export async function generateMetadata(): Promise<Metadata> {
  const category = await getCategory(CATEGORY_SLUG);
  if (!category) return { title: "Rooms, PG & Hostels" };

  return {
    title: "Rooms, PG & Hostels",
    description: category.description,
    alternates: { canonical: "/stays" },
    openGraph: {
      title: "Rooms, PG & Hostels — V Solve Hub",
      description: category.description,
      type: "website",
    },
  };
}

function BrowseSkeleton() {
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

async function StaysBrowse() {
  const [category, services] = await Promise.all([
    getCategory(CATEGORY_SLUG),
    getCategoryServices(CATEGORY_SLUG),
  ]);

  if (category === null || services === null) notFound();

  return <CategoryTileBrowser category={category} services={services} activeTileSlug={DEFAULT_TILE} />;
}

export default function StaysLandingPage() {
  return (
    <div className="min-h-screen bg-[#FBFBFA] pb-20 text-navy-900 selection:bg-signal-500 selection:text-white">
      <main className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        <StaysHero />

        <section className="mt-10 sm:mt-12">
          <Suspense fallback={<BrowseSkeleton />}>
            <StaysBrowse />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
