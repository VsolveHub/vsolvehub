import Link from "next/link";
import { EmptyState } from "@vsolve/ui";

import { ServicePhoto } from "./category-artwork";
import type { Category } from "../queries";
import { catalogCategoryHref } from "@/lib/routes";

// `DESKTOP_PREVIEW_LIMIT`, `seeAllVisibility` and `previewItemVisibility` are gone with the
// truncated grid they served. They existed to decide which tiles to hide at each breakpoint
// and whether "See all" was therefore needed; a row that scrolls hides nothing, so the only
// question left is whether the category has enough subcategories to deserve its own page —
// which the caller answers inline.

function SubcategoryArtwork({
  imageUrl,
  iconKey,
}: {
  imageUrl: string;
  iconKey: string;
}) {
  return (
    <ServicePhoto
      imageUrl={imageUrl}
      iconKey={iconKey}
      className="shadow-xs transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
    />
  );
}

export function CatalogCategoryRows({ categories }: { categories: readonly Category[] }) {
  const rows = categories
    .map((category) => ({
      category,
      subcategories: category.subcategories.filter(
        (subcategory) => subcategory.service_count > 0,
      ),
    }))
    .filter(({ subcategories }) => subcategories.length > 0);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No services are published yet"
        description="Our catalogue is being set up. Please check back shortly."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-4 sm:gap-10">
      {rows.map(({ category, subcategories }) => (
        <section key={category.id} aria-labelledby={`catalog-category-${category.slug}`}>
          <header className="mb-3 flex min-h-11 items-center gap-3 border-b border-line/70">
            <h2
              id={`catalog-category-${category.slug}`}
              className="min-w-0 flex-1 text-base font-extrabold tracking-tight text-text sm:text-lg"
            >
              {category.name}
            </h2>
            {subcategories.length > 3 ? (
              <Link
                href={catalogCategoryHref(category.slug)}
                aria-label={`See all ${category.name} subcategories`}
                className={`inline-flex min-h-11 items-center gap-1 rounded-control px-1 text-sm font-bold text-action transition-opacity duration-fast hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
              >
                See all
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
                  <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
                </svg>
              </Link>
            ) : null}
          </header>

          {/* A scroller, not a truncated grid.
              The row used to render six tiles and hide the rest behind per-index
              visibility classes, so a category with fifteen subcategories showed six and
              gave no sign the others existed — the only way through was "See all". Now
              every subcategory is in the row and the row scrolls, which is what a person
              tries first when a strip of tiles runs off the edge.

              Bleeds to the viewport edge (`-mx-4 px-4`) so the last tile is visibly cut
              rather than ending flush, which is the cue that there is more. Snapping is
              per-tile so a flick lands on a tile rather than mid-label. */}
          <ul className="no-scrollbar -mx-4 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:gap-4 lg:mx-0 lg:px-0 lg:scroll-px-0">
            {subcategories.map((subcategory) => (
              <li
                key={subcategory.id}
                className="w-[92px] shrink-0 snap-start sm:w-[110px] lg:w-[128px]"
              >
                <Link
                  href={catalogCategoryHref(category.slug, subcategory.slug)}
                  className="group flex min-h-11 flex-col items-center gap-2 rounded-card active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <SubcategoryArtwork
                    imageUrl={subcategory.image_url}
                    iconKey={subcategory.icon_key}
                  />
                  <span className="line-clamp-2 w-full text-center text-[12px] font-semibold leading-tight text-text sm:text-[13px]">
                    {subcategory.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
