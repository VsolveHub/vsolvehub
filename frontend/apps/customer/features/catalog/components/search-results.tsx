import Link from "next/link";
import { EmptyState, buttonStyles } from "@vsolve/ui";

import type { CatalogSearchResults } from "../search";
import { ServiceRow } from "./service-row";

/**
 * What `/catalog?q=…` renders.
 *
 * Three states, and the distinction between the last two is the point:
 *
 *   matches      -> the ranked list, plus the trades worth opening whole
 *   no matches   -> "nothing matches *that*", with the way back to browsing
 *   no catalogue -> handled by the page, not here
 *
 * The old search collapsed the middle case into "No services are published
 * yet", which told a customer searching for something we do not offer that we
 * offer nothing at all. Those two sentences have to be different sentences.
 */
export function SearchResults({
  query,
  results,
}: {
  query: string;
  results: CatalogSearchResults;
}) {
  const { services, categories } = results;

  if (services.length === 0 && categories.length === 0) {
    return (
      <EmptyState
        title={`Nothing matches “${query}”`}
        description="Try a shorter word, or the name of the appliance or room. Everything we do is on the catalogue below."
        action={
          <Link href="/catalog" className={buttonStyles({ variant: "outline" })}>
            Browse all services
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {services.length > 0 ? (
        <section aria-labelledby="search-services-heading">
          {/* The count is a real one and is said plainly. A search that quietly
              caps its own results and does not say so teaches people the
              catalogue is smaller than it is. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
            <h2
              id="search-services-heading"
              className="font-serif text-[1.35rem] font-extrabold tracking-tight text-navy-900"
            >
              Services
            </h2>
            <p className="text-sm font-medium text-text-secondary">
              {services.length} {services.length === 1 ? "match" : "matches"} for{" "}
              <span className="font-bold text-navy-900">“{query}”</span>
            </p>
          </div>

          <ul className="mt-4 flex flex-col gap-2.5">
            {services.map(({ service, category }) => (
              <ServiceRow key={service.id} service={service} category={category} />
            ))}
          </ul>
        </section>
      ) : null}

      {categories.length > 0 ? (
        <section aria-labelledby="search-categories-heading">
          <h2
            id="search-categories-heading"
            className="border-b border-line pb-3 font-serif text-[1.35rem] font-extrabold tracking-tight text-navy-900"
          >
            {services.length > 0 ? "Or open the whole trade" : "Trades that match"}
          </h2>

          {/* Chips rather than the browse tiles. At this point in the journey a
              category is a destination, not something to be sold again — the
              tiles would out-shout the results they sit under. */}
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/catalog/${category.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-navy-900 transition-colors duration-fast hover:border-navy-300 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {category.name}
                  <svg viewBox="0 0 20 20" fill="none" className="size-3.5 text-text-muted" aria-hidden="true">
                    <path
                      d="M4 10h11m-4-4 4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
