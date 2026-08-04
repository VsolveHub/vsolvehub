import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@vsolve/ui";

import { getCategories } from "@/features/catalog/queries";

/**
 * The Customer home.
 *
 * This route did not exist. `app/` had a layout, an error boundary, a loading
 * state and a `not-found` — and no `page.tsx` — so the site root returned 404
 * while the catalog, the booking flow, the cart and the bookings tree all sat
 * behind it working perfectly.
 *
 * A Server Component: everything here is public, identical for everyone and
 * indexable, so no JavaScript ships for it. The categories come from the same
 * cached read the catalog index uses, which means landing here costs no extra
 * Django request once that cache is warm.
 *
 * No hero statistic, no testimonial, no "trusted by" count. Every number on this
 * page would have to be one we could stand behind, and the honest version of a
 * marketing figure we do not measure is to not print it.
 */

export const metadata: Metadata = {
  title: "V Solve Hub — Book a verified technician",
  description:
    "Book home services with a real, eligible professional. See the price before you book, and pay only once someone has committed to the job.",
  alternates: { canonical: "/" },
};

/** Matches the catalog index: the catalogue changes when Operations publishes. */
export const revalidate = 300;

const PROMISES = [
  {
    title: "See the price first",
    body: "Every service shows what it costs before you book. The price is worked out by us, not guessed at your door.",
  },
  {
    title: "Someone commits before you pay",
    body: "We find a professional and they accept the job. You are only asked to pay once every visit has someone on it.",
  },
  {
    title: "One basket, one booking",
    body: "Add several jobs and we work out whether one person can do them together or you need separate visits — and tell you why.",
  },
] as const;

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
    // An empty catalogue is an operational problem. Saying so beats rendering
    // sample categories that nobody can actually book.
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
          <h3 className="font-semibold text-text group-hover:text-text-link">{category.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{category.description}</p>
        </Link>
      ))}
    </div>
  );
}

export default async function HomePage() {
  // A frontend build must not require a live Django deployment. This skips
  // build-time prerendering; the read below keeps its own five-minute policy.
  await connection();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-bold leading-tight text-text sm:text-4xl">
          Book a verified professional for work around your home
        </h1>
        <p className="mt-3 text-base leading-7 text-text-secondary">
          Tell us what needs doing and we will price it, find someone qualified and
          hold the time. You pay once they have committed — not before.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/catalog"
            className="inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Browse services
          </Link>
          <Link
            href="/bookings"
            className="inline-flex min-h-12 items-center rounded-control border border-line-strong px-7 font-semibold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            My bookings
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="mt-12">
        <h2 id="how-heading" className="text-lg font-bold text-text">
          How booking works
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <li key={promise.title} className="rounded-card border border-line bg-surface p-5">
              <h3 className="font-semibold text-text">{promise.title}</h3>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{promise.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="categories-heading" className="mt-12">
        <h2 id="categories-heading" className="text-lg font-bold text-text">
          What do you need?
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Pick a category to see what we cover and what it costs.
        </p>
        <div className="mt-4">
          <Suspense fallback={<CategoryGridSkeleton />}>
            <CategoryGrid />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
