import { createElement } from "react";
import Link from "next/link";
import { EmptyState } from "@vsolve/ui";

import { iconForService } from "../icon-catalogue/service-icon";
import type { Category } from "../queries";

const DESKTOP_PREVIEW_LIMIT = 6;

function seeAllVisibility(subcategoryCount: number): string {
  if (subcategoryCount <= 3) return "hidden";
  if (subcategoryCount === 4) return "inline-flex sm:hidden";
  if (subcategoryCount <= DESKTOP_PREVIEW_LIMIT) return "inline-flex lg:hidden";
  return "inline-flex";
}

function previewItemVisibility(index: number): string {
  if (index < 3) return "block";
  if (index === 3) return "hidden sm:block";
  return "hidden lg:block";
}

function SubcategoryArtwork({
  imageUrl,
  iconKey,
}: {
  imageUrl: string;
  iconKey: string;
}) {
  if (imageUrl !== "") {
    return (
      <span className="block aspect-square w-full overflow-hidden rounded-card bg-surface-sunken shadow-xs">
        {/* Catalog images are Operations-authored remote URLs. A native image lets Operations
            change providers without widening a build-time host allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="grid aspect-square w-full place-items-center rounded-card bg-surface-sunken text-text-secondary shadow-xs"
    >
      {createElement(iconForService(iconKey || "service"), {
        className: "size-7",
        strokeWidth: 1.7,
      })}
    </span>
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
                href={`/catalog/${category.slug}`}
                aria-label={`See all ${category.name} subcategories`}
                className={`${seeAllVisibility(subcategories.length)} min-h-11 items-center gap-1 rounded-control px-1 text-sm font-bold text-action transition-opacity duration-fast hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
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

          <ul className="grid list-none grid-cols-3 gap-x-3 p-0 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6">
            {subcategories.slice(0, DESKTOP_PREVIEW_LIMIT).map((subcategory, index) => (
              <li key={subcategory.id} className={`min-w-0 ${previewItemVisibility(index)}`}>
                <Link
                  href={`/catalog/${category.slug}?tile=${subcategory.slug}`}
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
