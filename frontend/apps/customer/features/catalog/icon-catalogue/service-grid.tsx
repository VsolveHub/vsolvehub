import Link from "next/link";
import { EmptyState } from "@vsolve/ui";

import { CATALOGUE_SCROLL_MARGIN_CLASS, categorySectionId } from "./category-rail";
import type { CategoryGroup } from "./grouping";
import { iconForService } from "./service-icon";

/**
 * Every published service, as one scrollable sheet of icon tiles.
 *
 * This is the Catalogue screen from the M2 artboards, rendered against live
 * data: one section per trade, an uppercase heading with the running count, and
 * a three-column grid of icon-and-name tiles beneath it. Nothing else — no
 * cover images, no price copy, no drill-down through subcategories.
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
 * ## One heading level, deliberately
 *
 * The data has two levels (category → subcategory), and this grid used to
 * print both. The artboard prints one, and it is right to: a customer scanning
 * for "Full Bathroom Plumbing" is scanning trades, not Operations' internal
 * filing. `CategoryGroup.services` is the pre-flattened, order-preserving run,
 * so the subcategory still decides *where* a tile sits — it just no longer
 * interrupts the grid with a heading.
 *
 * ## Where a tile goes is the server's decision
 *
 * `hrefs` maps slug → destination, computed from `request_archetypes` by
 * `service-links.ts`: quote-based project services open the brief directly,
 * A3 time-block services open the crew form, and plain bookable services open
 * their own page. A slug the map does not know falls back to the service page,
 * which is always a correct — if occasionally roundabout — answer.
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
 * ## Each section is an anchor target
 *
 * `CategoryRail` jumps here with a plain `#fragment`, so every section carries
 * the id that rail computes and the scroll offset it publishes. Both come from
 * `category-rail.tsx` rather than being spelled out again — an id typed in two
 * files is an id that eventually disagrees.
 *
 * ## Press feedback, and the one place it is allowed to move
 *
 * A tile depresses on `:active` and nothing else animates. The transform is
 * listed property-by-property rather than as `transition-all`, because a grid
 * cell that transitions its own box reflows the row it is in; and it is dropped
 * under `prefers-reduced-motion` the way `packages/ui/src/button.tsx` does it.
 */

export interface ServiceGridProps {
  categories: readonly CategoryGroup[];
  /**
   * slug → destination. Optional so the grid stays renderable in isolation;
   * without it every tile opens the service's own page.
   */
  hrefs?: ReadonlyMap<string, string>;
}

export function ServiceGrid({ categories, hrefs }: ServiceGridProps) {
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
    <div className="flex flex-col gap-6">
      {categories.map((category) => {
        const headingId = `catalogue-category-${category.slug}`;

        return (
          <section
            key={category.id}
            id={categorySectionId(category.slug)}
            aria-labelledby={headingId}
            // The offset class is a literal inside `category-rail.tsx`, which is
            // under `@source "../features"`, so Tailwind's scanner still emits
            // the utility even though it is interpolated here.
            className={`flex flex-col gap-2.5 ${CATALOGUE_SCROLL_MARGIN_CLASS}`}
          >
            <div className="flex items-center gap-2.5">
              <h2
                id={headingId}
                className="flex-1 text-[13px] font-bold uppercase tracking-[0.06em] text-text-muted"
              >
                {category.name}
              </h2>
              <span className="shrink-0 text-[11px] font-bold text-text-muted">
                {serviceCountLabel(category.serviceCount)}
              </span>
            </div>

            <ul className="grid list-none grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
              {category.services.map((service) => {
                const Icon = iconForService(service.icon_key);
                const href =
                  hrefs?.get(service.slug) ??
                  `/catalog/${service.category_slug}/${service.slug}`;

                return (
                  <li key={service.id} className="min-w-0">
                    <Link
                      href={href}
                      prefetch={false}
                      className={[
                        "flex h-full min-h-24 flex-col items-center gap-2",
                        "rounded-card border border-line bg-surface px-1.5 py-3 text-center",
                        "transition-[background-color,border-color,transform] duration-fast ease-out",
                        "hover:border-line-strong hover:bg-surface-hover",
                        "active:scale-[0.97] active:bg-surface-sunken motion-reduce:transform-none",
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
