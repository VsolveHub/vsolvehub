import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@vsolve/ui";

import { getCategories } from "@/features/catalog/queries";

/**
 * Catalog index — every service category.
 *
 * A Server Component because the whole page is public, identical for everyone,
 * and needs to be indexable. There is no interactivity here worth shipping
 * JavaScript for, so none is shipped.
 *
 * Successor to the Prisma-backed `/services` tree; that route stays until
 * cutover (plan 05, Phase 8), at which point this moves to `/services` and the
 * legacy pages are deleted.
 */

export const metadata: Metadata = {
  title: "All services",
  description:
    "Book verified electricians, plumbers, cleaners and appliance technicians in Hyderabad. Transparent pricing, no call-out surprises.",
  alternates: { canonical: "/catalog" },
};

/**
 * Catalog changes only when Operations publishes an update.
 *
 * Must be a literal: Next statically analyses segment config at build time and
 * cannot resolve an imported constant. Keep in step with
 * `CATALOG_REVALIDATE_SECONDS` in lib/api/config.ts, which governs the
 * corresponding fetch-level cache policy.
 */
export const revalidate = 300;

function CategoryGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}

async function CategoryGrid() {
  const categories = await getCategories();

  if (categories.length === 0) {
    // Honest, not decorative. An empty catalogue is an operational problem, and
    // saying so beats rendering sample categories that do not exist.
    return (
      <EmptyState
        title="No services are published yet"
        description="Our catalogue is being set up. Please check back shortly."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/catalog/${category.slug}`}
          className="group flex flex-col rounded-card border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-hover"
        >
          <h2 className="font-semibold text-text group-hover:text-text-link">{category.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{category.description}</p>
          {category.subcategories.length > 0 ? (
            <p className="mt-3 text-xs text-text-muted">
              {category.subcategories
                .slice(0, 3)
                .map((sub) => sub.name)
                .join(" · ")}
              {category.subcategories.length > 3 ? " and more" : ""}
            </p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export default async function CatalogPage() {
  // The catalogue is server-rendered, but a frontend build must not require a
  // live Django deployment. The request boundary skips build-time prerendering;
  // the fetch below still uses its explicit five-minute Data Cache policy.
  await connection();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="pb-6">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">All services</h1>
        <p className="mt-2 max-w-prose text-text-secondary">
          Verified professionals, priced up front. Choose a category to see what each visit costs
          and how long it usually takes.
        </p>
      </header>

      {/* Suspense is inside the page so the heading renders immediately and only
          the data-dependent region streams in. Failures propagate to error.tsx,
          which keeps them out of the route cache. */}
      <Suspense fallback={<CategoryGridSkeleton />}>
        <CategoryGrid />
      </Suspense>
    </main>
  );
}
