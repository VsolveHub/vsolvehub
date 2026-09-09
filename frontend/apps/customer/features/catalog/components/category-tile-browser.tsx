/* eslint-disable @next/next/no-img-element -- Catalog thumbnails are fixed-size
 * (size-16/size-20) and come from arbitrary remote hosts. `next/image` would need
 * every one of those hosts in `images.remotePatterns`, which this app does not
 * configure; `category-artwork.tsx` opts out the same way for the same reason. */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney, cn } from "@vsolve/ui";
import { ChevronRight, ClipboardList, X } from "lucide-react";

import { ServicePhoto } from "./category-artwork";
import { AddToCartButton } from "./add-to-cart-button";
import { TileDesktopSplitPane } from "./tile-desktop-split-pane";
import { StayCatalogListingPane } from "@/features/stays/components/stay-catalog-listing-pane";
import { useServiceDetail } from "../client-queries";
import { serviceHref } from "../service-href";
import type { Category, ServiceCard } from "../queries";

function tileHref(tile: TileGroup, categorySlug: string): string {
  const only = tile.services.length === 1 ? tile.services[0] : undefined;
  if (only !== undefined) return serviceHref(only, categorySlug);
  return `/catalog/${categorySlug}?tile=${tile.slug}`;
}

function TileGrid({ tiles, categorySlug }: { tiles: TileGroup[]; categorySlug: string }) {
  return (
    <ul className="grid list-none grid-cols-3 gap-x-3 gap-y-5 p-0 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6">
      {tiles.map((tile) => (
        <li key={tile.slug} className="min-w-0">
          <Link
            href={tileHref(tile, categorySlug)}
            className="group flex min-h-11 flex-col items-center gap-2 rounded-card active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <ServicePhoto
              imageUrl={tile.imageUrl}
              iconKey={tile.iconKey}
              className="shadow-xs transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
            />
            <span className="line-clamp-2 w-full text-center text-[12px] font-semibold leading-tight text-text sm:text-[13px]">
              {tile.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const A3_TIME_BLOCK = "A3_TIME_BLOCK";

export interface TileGroup {
  slug: string;
  name: string;
  description: string;
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
      description: subcategory.description,
      iconKey: subcategory.icon_key,
      imageUrl: subcategory.image_url,
      services: bySlug.get(subcategory.slug) ?? [],
    }))
    .filter((tile) => tile.services.length > 0);
}

/** What buying this service is, in one honest line. */
export function priceLine(service: ServiceCard): string {
  if (service.starting_price !== null) {
    return `Starts at ${formatMoney(service.starting_price.amount_paise)}`;
  }
  if (service.request_archetypes.includes("A7_RENTAL")) {
    return "Check availability & daily rates";
  }
  if (service.request_archetypes.includes(A3_TIME_BLOCK)) {
    return "Booked by the day, at the published rate";
  }
  if (service.request_archetypes.length > 0) {
    return "Free quote after a site visit";
  }
  return "Price confirmed before you pay";
}

function WhatYouCanBookModal({
  service,
  categorySlug: _categorySlug,
  onClose,
}: {
  service: ServiceCard;
  categorySlug: string;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useServiceDetail(service.slug);

  const fallbackUrls = [
    service.cover?.url,
    ...(detail?.media?.map((m: { url: string }) => m.url) ?? []),
  ].filter(Boolean) as string[];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="what-you-can-book-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-3xl sm:rounded-2xl border border-line bg-surface p-4 sm:p-6 shadow-2xl max-h-[80dvh] sm:max-h-[85dvh] flex flex-col gap-3.5 animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-selected-surface text-signal-500">
              <ClipboardList className="size-4" />
            </span>
            <h3 id="what-you-can-book-title" className="text-base sm:text-lg font-bold text-navy-900">
              What you can book
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto min-h-0 flex-1 flex flex-col gap-3.5 pr-1 pb-4 no-scrollbar">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-surface-sunken animate-pulse" />
              ))}
            </div>
          ) : detail && detail.variants && detail.variants.length > 0 ? (
            detail.variants.map((variant) => {
              const variantImg =
                variant.image_url && variant.image_url.trim() !== ""
                  ? variant.image_url
                  : (fallbackUrls[0] ?? "");
              return (
                <div
                  key={variant.id}
                  className="rounded-2xl border border-line bg-white p-3.5 sm:p-4 flex flex-col gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Left Thumbnail Image */}
                    <span className="size-16 sm:size-20 shrink-0 rounded-2xl overflow-hidden bg-[#F4F1EC] grid place-items-center">
                      {variantImg ? (
                        <img
                          src={variantImg}
                          alt=""
                          loading="lazy"
                          className={
                            variantImg.includes("/Service%20Cover/") ||
                            variantImg.includes("/Service Cover/")
                              ? "size-[80%] object-contain"
                              : "size-full object-cover"
                          }
                        />
                      ) : (
                        <ServicePhoto imageUrl="" iconKey={service.icon_key} />
                      )}
                    </span>

                    {/* Right Info */}
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <h4 className="text-base font-bold text-navy-900 leading-snug">{variant.name}</h4>
                      {variant.description ? (
                        <p className="text-xs sm:text-sm text-text-secondary leading-relaxed line-clamp-2">
                          {variant.description}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs italic text-text-muted">
                        {variant.task_lines && variant.task_lines.length > 0
                          ? `${variant.task_lines.length} tasks you can choose from`
                          : "Priced on booking"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-line/60">
                    <div>
                      <span className="block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                        STARTS AT
                      </span>
                      <span data-numeric className="block text-base sm:text-lg font-extrabold tabular-nums text-navy-900">
                        {formatMoney(variant.starting_price.amount_paise)}
                      </span>
                    </div>

                    <AddToCartButton variantId={variant.id} size="compact" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-line bg-white p-3.5 sm:p-4 flex flex-col gap-3 shadow-2xs">
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="size-16 sm:size-20 shrink-0 rounded-2xl overflow-hidden bg-[#F4F1EC] grid place-items-center">
                  {fallbackUrls[0] ? (
                    <img
                      src={fallbackUrls[0]}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <ServicePhoto imageUrl="" iconKey={service.icon_key} />
                  )}
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <h4 className="text-base font-bold text-navy-900">{service.name}</h4>
                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {service.short_description}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-line/60">
                <div>
                  <span className="block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                    STARTS AT
                  </span>
                  <span data-numeric className="block text-base sm:text-lg font-extrabold tabular-nums text-navy-900">
                    {priceLine(service)}
                  </span>
                </div>
                {service.bookable_variant_id ? (
                  <AddToCartButton variantId={service.bookable_variant_id} size="compact" />
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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
  const router = useRouter();
  const [selectedServiceForModal, setSelectedServiceForModal] = useState<ServiceCard | null>(null);
  const tiles = groupByTile(category, services);

  if (tiles.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm leading-6 text-text-secondary">
        Nothing is on sale in {category.name} for your area yet. The catalogue updates as
        professionals come on board — check back soon.
      </p>
    );
  }

  const activeTile =
    activeTileSlug !== null
      ? tiles.find((tile) => tile.slug === activeTileSlug)
      : undefined;

  if (activeTile === undefined) {
    return <TileGrid tiles={tiles} categorySlug={category.slug} />;
  }

  return (
    <>
      {/* Desktop view: 3-pane split view matching desktop UI */}
      <div className="hidden md:block w-full h-full min-h-0 flex-1">
        <TileDesktopSplitPane category={category} tiles={tiles} activeTile={activeTile} />
      </div>

      {/* Mobile view: 2-column vertical rail + sub-services + popup modal */}
      <div className="md:hidden flex items-start gap-2 sm:gap-4 h-full min-h-0 flex-1">
        {/* Left Column: Independently scrollable vertical category rail */}
        <nav
          aria-label={`${category.name} categories`}
          className="w-20 sm:w-24 shrink-0 h-full overflow-y-auto no-scrollbar border-r border-line/80 pr-2 sm:pr-3 pb-16"
        >
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {tiles.map((tile) => {
              const isActive = tile.slug === activeTile.slug;
              return (
                <li key={tile.slug}>
                  <Link
                    href={`/catalog/${category.slug}?tile=${tile.slug}`}
                    scroll={false}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-2.5 px-1 text-center transition-all duration-150 group",
                      isActive
                        ? "bg-[#FFF8F3] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r before:bg-signal-500"
                        : "bg-[#F8F9FA] hover:bg-[#F0F1F3]"
                    )}
                  >
                    {tile.imageUrl ? (
                      <img
                        src={tile.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-12 sm:size-14 object-contain shrink-0 transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <ServicePhoto
                        imageUrl={tile.imageUrl}
                        iconKey={tile.iconKey}
                        className="size-12"
                      />
                    )}
                    <span
                      className={cn(
                        "line-clamp-2 text-[10px] sm:text-[11px] font-bold leading-tight px-0.5",
                        isActive ? "text-signal-700" : "text-navy-900"
                      )}
                    >
                      {tile.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right Column: Stays listing pane OR sub-services list */}
        {category.slug === "rooms-pg-hostel" ? (
          <section className="flex-1 min-w-0 h-full overflow-y-auto no-scrollbar pl-1 sm:pl-2 pb-16">
            <StayCatalogListingPane
              categorySlug={category.slug}
              categoryName={category.name}
              activeTile={activeTile}
            />
          </section>
        ) : (
          <section
            aria-labelledby={`category-tile-${activeTile.slug}`}
            className="flex-1 min-w-0 h-full overflow-y-auto no-scrollbar pl-1 sm:pl-2 pb-16 flex flex-col gap-3"
          >
            {/* Header with Title and Service Count */}
            <div className="flex items-baseline justify-between gap-3 pb-1 border-b border-line/60 shrink-0">
              <h2
                id={`category-tile-${activeTile.slug}`}
                className="text-lg sm:text-2xl font-extrabold tracking-tight text-navy-900"
              >
                {activeTile.name}
              </h2>
              <span className="text-xs sm:text-sm font-semibold text-text-secondary shrink-0">
                {activeTile.services.length === 1
                  ? "1 service"
                  : `${activeTile.services.length} services`}
              </span>
            </div>

            {/* Sub-services Cards List */}
            <ul className="flex flex-col gap-2.5 sm:gap-3 list-none p-0 m-0">
              {activeTile.services.map((service) => {
                const imgUrl = service.cover?.url ?? activeTile.imageUrl;
                return (
                  <li key={service.id}>
                    <Link
                      href={serviceHref(service, category.slug, activeTile.slug)}
                      prefetch={false}
                      className="group flex items-start sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl border border-line/80 bg-white p-3 sm:p-4 shadow-xs transition-all duration-150 hover:shadow-md hover:border-line-strong active:scale-[0.99]"
                    >
                      {/* Image on Left */}
                      <span className="size-16 sm:size-20 shrink-0 rounded-2xl overflow-hidden bg-[#F4F1EC] grid place-items-center">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt=""
                            loading="lazy"
                            className={
                              imgUrl.includes("/Service%20Cover/") || imgUrl.includes("/Service Cover/")
                                ? "size-[80%] object-contain"
                                : "size-full object-cover"
                            }
                          />
                        ) : (
                          <ServicePhoto imageUrl="" iconKey={service.icon_key} />
                        )}
                      </span>

                      {/* Details in Center */}
                      <div className="min-w-0 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-navy-900 leading-snug group-hover:text-signal-700 transition-colors">
                            {service.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs text-text-secondary leading-relaxed">
                            {service.short_description}
                          </p>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <p className="text-xs sm:text-sm font-bold text-navy-900">
                            {priceLine(service)}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (service.request_archetypes.length > 0) {
                                router.push(serviceHref(service, category.slug, activeTile.slug));
                                return;
                              }
                              setSelectedServiceForModal(service);
                            }}
                            className="inline-flex shrink-0 items-center justify-center font-bold shadow-xs transition-colors rounded-lg px-3.5 h-8 text-xs bg-navy-900 text-white hover:bg-navy-800 active:scale-95 cursor-pointer"
                          >
                            {service.request_archetypes.length > 0
                              ? "Ask"
                              : "Add"}
                          </button>
                        </div>
                      </div>

                      {/* Arrow on Right */}
                      <ChevronRight className="size-5 shrink-0 text-text-muted group-hover:text-navy-900 group-hover:translate-x-0.5 transition-all self-center hidden min-[400px]:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Pop-up Dialog for "What you can book" */}
      {selectedServiceForModal ? (
        <WhatYouCanBookModal
          service={selectedServiceForModal}
          categorySlug={category.slug}
          onClose={() => setSelectedServiceForModal(null)}
        />
      ) : null}
    </>
  );
}
