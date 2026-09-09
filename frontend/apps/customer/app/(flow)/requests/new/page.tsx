import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorState } from "@vsolve/ui";

import { getCategories, getCategoryServices } from "@/features/catalog/queries";

/**
 * Category-first entry to a requirement — `M2-FE-201`.
 *
 * ## Nobody is asked to pick an archetype
 *
 * `GAP-006`. The two paragraphs at the top say, in ordinary words, the only
 * distinction that matters to a Customer: are you hiring people for a stretch
 * of time, or asking for a finished result. They are not asked to choose
 * between those either — it is context, so they recognise that both are covered
 * here. The platform infers the lifecycle from what they answer on screen 1,
 * and the words "A3", "A5", "time block" and "custom project" appear nowhere a
 * Customer can read.
 *
 * ## One route, two states, no client fetch
 *
 * The category list and one category's services are both public catalog reads
 * that the app already server-renders and caches. Choosing a category is a
 * `?category=` navigation rather than a client query, so this page has no
 * loading state to invent and no second data layer — the same reason the shop
 * routes are shaped this way.
 *
 * ## Every service is offered, and that is a gap rather than a decision
 *
 * Nothing published says which services accept A3/A5 requests: `ServiceCard`
 * carries `bookable_variant_id` for the A1 path and no archetype, and only
 * `GET /services/{slug}/configuration/` reveals whether an M2 variant exists.
 * So a Customer can pick a service this does not cover and be told at the next
 * step. The next step tells them plainly and offers the way back rather than
 * dead-ending, and the missing field is logged in the execution plan §7.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Describe a job",
  robots: { index: false, follow: false },
};

const CARD =
  "block rounded-card border border-line bg-surface p-4 hover:border-warm-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const categories = await getCategories();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-xl font-bold text-text">What do you need done?</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Some jobs need people for a while — a few workers for a week, a team for
        a month. Others are one finished result — a room done, a system
        installed. Describe either one here and we will work out the rest.
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Describing a job is free, and nothing is charged until professionals have
        sent you quotes to look at.
      </p>

      {category === undefined ? (
        <section aria-labelledby="categories-heading" className="mt-8">
          <h2 id="categories-heading" className="text-base font-semibold text-text">
            Start with the area of work
          </h2>
          <ul className="mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {categories.map((entry) => (
              <li key={entry.slug}>
                <Link href={`/requests/new?category=${entry.slug}`} className={CARD}>
                  <span className="font-semibold text-text">{entry.name}</span>
                  {entry.description ? (
                    <span className="mt-1 block text-sm text-text-secondary">
                      {entry.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          {categories.length === 0 ? (
            <EmptyState
              title="Nothing is listed yet"
              description="We could not find any areas of work to show. Please try again shortly."
            />
          ) : null}
        </section>
      ) : (
        <CategoryServices categorySlug={category} />
      )}
    </main>
  );
}

async function CategoryServices({ categorySlug }: { categorySlug: string }) {
  const services = await getCategoryServices(categorySlug);

  if (services === null) {
    // `null` is a 404 from the catalog: this slug does not name a category.
    // Distinguished from an empty category on purpose — one is a bad link and
    // the other is a real, if unhelpful, answer.
    return (
      <div className="mt-8">
        <ErrorState
          title="We could not find that area of work"
          message="The link may be out of date. Choose from the list instead."
          severity="warning"
          inline
        />
        <Link
          href="/requests/new"
          className="mt-3 inline-block font-semibold text-info-text underline-offset-4 hover:underline"
        >
          Back to all areas of work
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="services-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="services-heading" className="text-base font-semibold text-text">
          Which one is closest?
        </h2>
        <Link
          href="/requests/new"
          className="font-semibold text-info-text underline-offset-4 hover:underline"
        >
          Change area
        </Link>
      </div>

      {services.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Nothing here yet"
            description="We do not cover anything in this area at the moment. Try another one."
          />
        </div>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-3 p-0">
          {services.map((service) => (
            <li key={service.slug}>
              <Link href={`/requests/new/${service.slug}`} prefetch={false} className={CARD}>
                <span className="font-semibold text-text">{service.name}</span>
                {service.short_description ? (
                  <span className="mt-1 block text-sm text-text-secondary">
                    {service.short_description}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
