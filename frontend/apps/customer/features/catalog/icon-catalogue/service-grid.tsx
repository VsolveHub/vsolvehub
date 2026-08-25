import Link from "next/link";
import { EmptyState } from "@vsolve/ui";

import type { CategoryGroup } from "./grouping";
import { iconForService } from "./service-icon";

/**
 * Every published service, as one scrollable sheet of icon tiles.
 *
 * ## Why a tile is an icon and a name and nothing else
 *
 * The old catalogue's card carried a cover image, a price band, a rating and a
 * badge. That is a good card for a *shortlist* and a bad one for a catalogue:
 * at four hundred services it is four hundred images on the critical path, and
 * a "from ₹499" on a tile is a price claim made before anyone has said where
 * they live or what is wrong. `ServiceIndexItem` publishes none of it, which is
 * the contract agreeing — the index row is identity, ordering and an icon key.
 *
 * So the tile shows what it can actually stand behind. Recognition does the
 * work; the price conversation happens on the service's own page, after the
 * questions that make a number honest.
 *
 * ## No `"use client"`
 *
 * Nothing here reacts. A tile is a link, and a link is the platform's — it
 * takes focus, activates on Enter, opens in a new tab on middle-click and works
 * before any JavaScript arrives. Hydrating four hundred static tiles to buy
 * nothing is exactly what FE-9 rules out.
 *
 * ## The icon comes from the server's vocabulary, never from the name
 *
 * `iconForService` is the only place a key becomes a glyph. Inferring one from
 * the service name is how "Water Tank Cleaning" ends up wearing a mop.
 *
 * ## Two heading levels, because the data has two
 *
 * A category ("Home") holds trades ("Septic Tank Services"), and a customer
 * looking for a plumber is looking for the trade. The category is the quiet
 * rail with the running total; the trade is the label next to the tiles. A
 * category with a single trade prints one heading, not the same words twice.
 */

export interface ServiceGridProps {
  categories: readonly CategoryGroup[];
}

export function ServiceGrid({ categories }: ServiceGridProps) {
  if (categories.length === 0) {
    // An honest nothing. The alternative — sample tiles so the page looks alive
    // — is the failure `EmptyState` exists to make harder.
    return (
      <EmptyState
        title="No services published yet"
        description="The catalogue is empty for this region. Nothing is hidden behind a filter — there is simply nothing to book here today."
      />
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {categories.map((category) => {
        const headingId = `catalogue-category-${category.slug}`;
        // One trade under one category means the two headings would say
        // near-identical things a line apart.
        const namesTrades = category.subcategories.length > 1;

        return (
          <section key={category.id} aria-labelledby={headingId} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2.5 border-b border-line pb-1.5">
              <h2
                id={headingId}
                className="flex-1 text-base font-extrabold tracking-tight text-text"
              >
                {category.name}
              </h2>
              <span className="shrink-0 text-[11px] font-bold text-text-muted">
                {serviceCountLabel(category.serviceCount)}
              </span>
            </div>

            {category.subcategories.map((subcategory) => (
              <div key={subcategory.id} className="flex flex-col gap-2.5">
                {namesTrades ? (
                  <div className="flex items-center gap-2.5">
                    <h3 className="flex-1 text-[13px] font-bold uppercase tracking-[0.06em] text-text-muted">
                      {subcategory.name}
                    </h3>
                    <span className="shrink-0 text-[11px] font-bold text-text-muted">
                      {serviceCountLabel(subcategory.services.length)}
                    </span>
                  </div>
                ) : null}

                <ul className="grid list-none grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                  {subcategory.services.map((service) => {
                    const Icon = iconForService(service.icon_key);

                    return (
                      <li key={service.id} className="min-w-0">
                        <Link
                          href={`/catalog/${service.category_slug}/${service.slug}`}
                          className={[
                            "flex h-full min-h-24 flex-col items-center gap-2",
                            "rounded-card border border-line bg-surface px-1.5 py-3 text-center",
                            "transition-colors duration-fast",
                            "hover:border-line-strong hover:bg-surface-hover",
                            "active:bg-surface-sunken",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-secondary"
                          >
                            <Icon size={20} strokeWidth={2} />
                          </span>
                          {/* Two lines, then an ellipsis. "Full Bathroom
                              Plumbing" needs both; a fifth line would make one
                              tile taller than its row and knock the grid out of
                              alignment. */}
                          <span className="line-clamp-2 text-pretty text-[12px] font-semibold leading-[15px] text-text">
                            {service.name}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** "1 service", not "1 services". */
function serviceCountLabel(count: number): string {
  return count === 1 ? "1 service" : `${count} services`;
}
