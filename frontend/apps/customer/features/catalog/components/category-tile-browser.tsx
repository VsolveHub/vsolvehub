import Link from "next/link";
import { formatMoney } from "@vsolve/ui";

import { ServicePhoto } from "./category-artwork";
import { serviceHref } from "../service-href";
import type { Category, ServiceCard } from "../queries";

/**
 * The category page's two views: the "Select a service" photo-tile grid, and one
 * tile's own services (2026-08-26 owner decision — image-led browsing, the
 * icon-and-text rule is reversed).
 *
 * ## Tiles are subcategories, and the grid is data all the way down
 *
 * Nothing here knows what an "electrician" is. The tiles are the category's
 * published subcategories; a tile's photo, glyph and name are server data, and
 * the services under it are grouped by `subcategory_slug` from the same category
 * read the old list used. A tile whose subcategory has no offerable service is
 * not rendered at all — a photo that opens an empty page is a broken promise,
 * and the server's own `service_count` counts ACTIVE services, not offerable
 * ones, so the grouping below is the honest number.
 *
 * ## One tap, one decision
 *
 * A tile with several services opens `?tile=<slug>` — the same page, narrowed.
 * A tile with exactly one service goes straight to that service's own route
 * ("Book a consultation" is one tap into the brief, not two). Server-rendered
 * throughout: the tile filter is a URL, so back, refresh and share all work.
 *
 * ## The price line speaks the commercial model
 *
 * "Starts at ₹X" is only ever a published rate. A quote-priced service says what
 * actually happens — a free quote after a site visit — and a crew service says
 * it is booked by the day. No number is invented for the unpriced paths.
 */

const A3_TIME_BLOCK = "A3_TIME_BLOCK";

export interface TileGroup {
  slug: string;
  name: string;
  iconKey: string;
  imageUrl: string;
  services: ServiceCard[];
}

/** The category's subcategories, in their published order, with their offerable services. */
export function groupByTile(category: Category, services: readonly ServiceCard[]): TileGroup[] {
  const bySlug = new Map<string, ServiceCard[]>();
  for (const service of services) {
    const list = bySlug.get(service.subcategory_slug) ?? [];
    list.push(service);
    bySlug.set(service.subcategory_slug, list);
  }
  return category.subcategories
    .map((subcategory) => ({
      slug: subcategory.slug,
      name: subcategory.name,
      iconKey: subcategory.icon_key,
      imageUrl: subcategory.image_url,
      services: bySlug.get(subcategory.slug) ?? [],
    }))
    .filter((tile) => tile.services.length > 0);
}

function tileHref(tile: TileGroup, categorySlug: string): string {
  const only = tile.services.length === 1 ? tile.services[0] : undefined;
  if (only !== undefined) return serviceHref(only, categorySlug);
  return `/catalog/${categorySlug}?tile=${tile.slug}`;
}

/** What buying this service is, in one honest line. */
function priceLine(service: ServiceCard): string {
  if (service.starting_price !== null) {
    return `Starts at ${formatMoney(service.starting_price.amount_paise)}`;
  }
  if (service.request_archetypes.includes(A3_TIME_BLOCK)) {
    return "Booked by the day, at the published rate";
  }
  if (service.request_archetypes.length > 0) {
    return "Free quote after a site visit";
  }
  return "Price confirmed before you pay";
}

function TileGrid({ tiles, categorySlug }: { tiles: TileGroup[]; categorySlug: string }) {
  return (
    <section aria-labelledby="select-a-service">
      <div className="flex items-center gap-3 pb-4">
        <h2
          id="select-a-service"
          className="text-sm font-bold uppercase tracking-[0.08em] text-text-muted"
        >
          Select a service
        </h2>
        <div className="h-px flex-1 bg-line/70" />
      </div>
      <ul className="grid list-none grid-cols-3 gap-x-3 gap-y-5 p-0 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.slug} className="min-w-0">
            <Link
              href={tileHref(tile, categorySlug)}
              className="group flex flex-col items-center gap-2 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ServicePhoto
                imageUrl={tile.imageUrl}
                iconKey={tile.iconKey}
                className="transition-transform duration-fast group-hover:scale-[1.03]"
              />
              <span className="line-clamp-2 w-full text-center text-[13px] font-semibold leading-tight text-text">
                {tile.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TileServiceList({
  tile,
  categorySlug,
}: {
  tile: TileGroup;
  categorySlug: string;
}) {
  return (
    <section aria-labelledby={`tile-${tile.slug}`}>
      <div className="flex items-baseline justify-between gap-3 pb-4">
        <h2 id={`tile-${tile.slug}`} className="text-lg font-extrabold tracking-tight text-text">
          {tile.name}
        </h2>
        <span className="text-sm font-medium text-text-secondary">
          {tile.services.length === 1 ? "1 service" : `${tile.services.length} services`}
        </span>
      </div>
      <ul className="flex list-none flex-col gap-2.5 p-0">
        {tile.services.map((service) => (
          <li key={service.id}>
            <Link
              href={serviceHref(service, categorySlug)}
              className="flex items-center gap-4 rounded-card border border-line bg-surface p-3 shadow-card transition-shadow duration-fast hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span className="size-20 shrink-0">
                <ServicePhoto
                  imageUrl={service.cover?.url ?? tile.imageUrl}
                  iconKey={service.icon_key}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-text">{service.name}</span>
                <span className="mt-0.5 line-clamp-2 block text-sm leading-5 text-text-secondary">
                  {service.short_description}
                </span>
                <span className="mt-1 block text-sm font-bold text-text">
                  {priceLine(service)}
                </span>
              </span>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="size-5 shrink-0 text-text-muted"
              >
                <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CategoryTileBrowser({
  category,
  services,
  activeTileSlug,
}: {
  category: Category;
  services: readonly ServiceCard[];
  activeTileSlug: string | null;
}) {
  const tiles = groupByTile(category, services);

  if (tiles.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-6 text-sm leading-6 text-text-secondary">
        Nothing is on sale in {category.name} for your area yet. The catalogue updates as
        professionals come on board — check back soon.
      </p>
    );
  }

  const activeTile = tiles.find((tile) => tile.slug === activeTileSlug);

  if (activeTile !== undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={`/catalog/${category.slug}`}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="size-4"
          >
            <path d="M12.5 4.5 7 10l5.5 5.5" />
          </svg>
          All {category.name.toLowerCase()} services
        </Link>
        <TileServiceList tile={activeTile} categorySlug={category.slug} />
      </div>
    );
  }

  return <TileGrid tiles={tiles} categorySlug={category.slug} />;
}
