"use client";

import { useEffect, useState } from "react";
import { IntentLink } from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { formatMoney, cn } from "@vsolve/ui";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import Link from "next/link";

import { RemoteImage } from "@/components/remote-image";

import { ServicePhoto } from "./category-artwork";
import { AddToCartButton } from "./add-to-cart-button";
import { TileDesktopSplitPane } from "./tile-desktop-split-pane";
import { PolicyList } from "./policy-list";
import { useServiceDetail } from "../client-queries";
import { useCart } from "@/features/checkout/queries";
import { serviceHref } from "../service-href";
import { addsToServiceCopy, durationLabel, policyTexts, warrantyText } from "../service-facts";
import type { Category, ServiceCard } from "../queries";

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
  categorySlug,
  onClose,
}: {
  service: ServiceCard;
  categorySlug: string;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useServiceDetail(service.slug);
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const totalItems = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const totalPrice = cart?.estimate?.subtotal?.amount_paise
    ? formatMoney(cart.estimate.subtotal.amount_paise)
    : null;

  const fallbackUrls = [
    service.cover?.url,
    detail?.cover?.url,
    ...(detail?.variants?.map((v) => v.image_url) ?? []),
    ...(detail?.media?.map((m: { url: string }) => m.url) ?? []),
  ].filter(Boolean) as string[];

  const warranty = warrantyText(detail?.policies);
  const warrantyLabel = warranty?.match(/^\d+[- ]day warranty/i)?.[0] ?? warranty;
  const nonProcessPolicies = detail?.policies?.filter((p) => p.kind !== "PROCESS") ?? [];
  const variants = detail?.variants ?? [];

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
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-t-3xl rounded-b-none sm:rounded-2xl border-t border-line sm:border bg-surface p-4 sm:p-5 shadow-2xl max-h-[calc(85dvh-4rem)] sm:max-h-[85dvh] flex flex-col gap-3.5 animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-orange-50 text-action border border-orange-100">
              <ClipboardList className="size-4 text-action" />
            </span>
            <div className="min-w-0">
              <h3 id="what-you-can-book-title" className="text-base sm:text-lg font-bold text-navy-900 leading-tight truncate">
                {service.name}
              </h3>
              <p className="text-xs text-text-muted truncate">Available options & guarantee</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text transition-colors cursor-pointer shrink-0"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto min-h-0 flex-1 flex flex-col gap-4 pr-1 pb-2 no-scrollbar">
          {/* SECTION 1: Service variants in ONE ROW */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Choose Option ({variants.length > 0 ? variants.length : 1})
              </span>
              {variants.length > 1 && (
                <span className="text-[11px] font-medium text-text-muted">Swipe &rarr;</span>
              )}
            </div>

            {isLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {Array.from({ length: 2 }, (_, i) => (
                  <div key={i} className="h-44 w-[240px] shrink-0 rounded-2xl bg-surface-sunken animate-pulse" />
                ))}
              </div>
            ) : variants.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 pt-0.5 no-scrollbar snap-x snap-mandatory -mx-1 px-1">
                {variants.map((variant) => {
                  const variantImg =
                    variant.image_url && variant.image_url.trim() !== ""
                      ? variant.image_url
                      : (fallbackUrls[0] ?? "");
                  const duration = durationLabel(variant);
                  return (
                    <div
                      key={variant.id}
                      className="w-[230px] sm:w-[250px] shrink-0 snap-start rounded-2xl border border-line bg-white p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="size-16 shrink-0 rounded-xl overflow-hidden bg-[#F4F1EC] grid place-items-center border border-line/40">
                            {variantImg ? (
                              <RemoteImage
                                src={variantImg}
                                alt={variant.name}
                                width={64}
                                height={64}
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

                          {duration ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-text-muted border border-line/60 whitespace-nowrap">
                              <Clock className="size-3 text-text-muted" />
                              {duration}
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-navy-900 leading-snug line-clamp-2 min-h-[2.5rem] flex items-center" title={variant.name}>
                            {variant.name}
                          </h4>
                          {addsToServiceCopy(
                            variant.description,
                            service.short_description,
                            detail?.description ?? "",
                          ) ? (
                            <p className="mt-1 text-[11px] text-text-secondary leading-tight line-clamp-2">
                              {variant.description}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-text-muted leading-tight line-clamp-2">
                              Standard professional service
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3.5 pt-2.5 border-t border-line/60 flex items-center justify-between gap-2">
                        <div className="min-w-0 shrink-0">
                          <span className="block text-[9px] uppercase font-bold tracking-wider text-text-muted">
                            STARTS AT
                          </span>
                          <span data-numeric className="block text-base font-extrabold tabular-nums text-navy-900 leading-tight">
                            {formatMoney(variant.starting_price.amount_paise)}
                          </span>
                        </div>

                        <AddToCartButton variantId={variant.id} size="compact" showViewCart={false} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-white p-3.5 sm:p-4 flex flex-col gap-3 shadow-2xs">
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="size-16 sm:size-20 shrink-0 rounded-2xl overflow-hidden bg-[#F4F1EC] grid place-items-center">
                    {fallbackUrls[0] ? (
                      <RemoteImage
                        src={fallbackUrls[0]}
                        alt=""
                        width={80}
                        height={80}
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
                    <AddToCartButton variantId={service.bookable_variant_id} size="compact" showViewCart={false} />
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Vsolve Guarantee & Assurance */}
          <div className="rounded-2xl border border-[#0E7C86]/25 bg-gradient-to-br from-[#E6F4F5]/70 via-[#F7FCFC] to-[#E6F4F5]/40 p-3.5 sm:p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="grid size-7 place-items-center rounded-lg bg-[#0E7C86] text-white shadow-2xs">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#0E7C86] leading-tight">
                    Vsolve Guarantee & Assurance
                  </h4>
                  <p className="text-[11px] text-text-secondary font-medium">Every booking is protected & verified</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#0E7C86]/30 bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#0E7C86] whitespace-nowrap shadow-2xs">
                Verified
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-start gap-2 rounded-xl bg-white/95 border border-[#0E7C86]/15 p-2.5 shadow-2xs">
                <div className="grid size-5 place-items-center rounded-full bg-[#E6F4F5] text-[#0E7C86] shrink-0 mt-0.5">
                  <CheckCircle2 className="size-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-navy-900 leading-snug">
                    {warrantyLabel || "30-Day Guarantee"}
                  </p>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                    Workmanship warranty
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-white/95 border border-[#0E7C86]/15 p-2.5 shadow-2xs">
                <div className="grid size-5 place-items-center rounded-full bg-[#E6F4F5] text-[#0E7C86] shrink-0 mt-0.5">
                  <CheckCircle2 className="size-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-navy-900 leading-snug">
                    Price shown before you pay
                  </p>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                    Fixed rates, no hidden fees
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-white/95 border border-[#0E7C86]/15 p-2.5 shadow-2xs">
                <div className="grid size-5 place-items-center rounded-full bg-[#E6F4F5] text-[#0E7C86] shrink-0 mt-0.5">
                  <CheckCircle2 className="size-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-navy-900 leading-snug">
                    Extra work only with approval
                  </p>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                    No extra costs without consent
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-white/95 border border-[#0E7C86]/15 p-2.5 shadow-2xs">
                <div className="grid size-5 place-items-center rounded-full bg-[#E6F4F5] text-[#0E7C86] shrink-0 mt-0.5">
                  <CheckCircle2 className="size-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-navy-900 leading-snug">
                    Vetted Experts
                  </p>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                    Trained & background checked
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Service Policies (What's included, Not included, Good to know) AS IT IS on service page */}
          {nonProcessPolicies.length > 0 ? (
            <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-2xs">
              <PolicyList policies={nonProcessPolicies} />
            </div>
          ) : isLoading ? (
            <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-2xs animate-pulse">
              <div className="h-4 w-32 bg-surface-sunken rounded mb-3" />
              <div className="space-y-2">
                <div className="h-3 w-3/4 bg-surface-sunken rounded" />
                <div className="h-3 w-2/3 bg-surface-sunken rounded" />
                <div className="h-3 w-1/2 bg-surface-sunken rounded" />
              </div>
            </div>
          ) : null}

          {/* SECTION 4: View full details link */}
          <div className="pt-0.5 text-center">
            <Link
              href={`/catalog/${categorySlug}/${service.slug}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:text-action-hover transition-colors"
            >
              <span>View full service details, process & FAQs</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Modal Cart Footer: Pinned when items are in cart */}
        {totalItems > 0 && (
          <div className="border-t border-line pt-3 mt-1 flex items-center justify-between gap-3 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid size-8 place-items-center rounded-xl bg-orange-50 text-action border border-orange-100 shrink-0">
                <ShoppingBag className="size-4 text-action" />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-extrabold text-navy-900 leading-tight truncate">
                  {totalItems} {totalItems === 1 ? "item" : "items"} added
                </span>
                {totalPrice && (
                  <span className="block text-[11px] font-bold text-text-muted leading-tight">
                    Subtotal: {totalPrice}
                  </span>
                )}
              </div>
            </div>

            <Link
              href="/cart"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-navy-900 px-4 text-xs font-bold text-white shadow-xs hover:bg-navy-800 transition-colors shrink-0"
            >
              <span>View Cart</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
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

  // Home and `/catalog/{slug}` open the service list directly (first published
  // tile when none is selected). The old subcategory grid is no longer a stop.
  const activeTile =
    (activeTileSlug !== null
      ? tiles.find((tile) => tile.slug === activeTileSlug)
      : undefined) ?? tiles[0];

  return (
    <>
      {/* Desktop view: 3-pane split view matching desktop UI */}
      <div className="hidden lg:block w-full h-full min-h-0 flex-1">
        <TileDesktopSplitPane category={category} tiles={tiles} activeTile={activeTile} />
      </div>

      {/* Mobile / tablet: vertical rail + service rows */}
      <div className="lg:hidden flex items-start gap-2 sm:gap-4 h-full min-h-0 flex-1">
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
                  <IntentLink
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
                      <RemoteImage
                        src={tile.imageUrl}
                        alt=""
                        width={56}
                        height={56}
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
                  </IntentLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right Column: Independently scrollable sub-services list */}
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
              const imgUrl =
                service.cover?.url ??
                (service as { variants?: Array<{ image_url?: string }> }).variants?.find?.(
                  (v) => Boolean(v.image_url)
                )?.image_url ??
                activeTile.imageUrl;
              return (
                <li key={service.id}>
                  <IntentLink
                    href={serviceHref(service, category.slug)}
                    className="group flex items-start sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl border border-line/80 bg-white p-3 sm:p-4 shadow-xs transition-all duration-150 hover:shadow-md hover:border-line-strong active:scale-[0.99]"
                  >
                    {/* Image on Left */}
                    <span className="size-16 sm:size-20 shrink-0 rounded-2xl overflow-hidden bg-[#F4F1EC] grid place-items-center">
                      {imgUrl ? (
                        <RemoteImage
                          src={imgUrl}
                          alt=""
                          width={80}
                          height={80}
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
                              router.push(serviceHref(service, category.slug));
                              return;
                            }
                            setSelectedServiceForModal(service);
                          }}
                          className="inline-flex shrink-0 items-center justify-center font-bold shadow-xs transition-colors rounded-lg px-3.5 h-8 text-xs bg-navy-900 text-white hover:bg-navy-800 active:scale-95 cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Arrow on Right */}
                    <ChevronRight className="size-5 shrink-0 text-text-muted group-hover:text-navy-900 group-hover:translate-x-0.5 transition-all self-center hidden min-[400px]:block" />
                  </IntentLink>
                </li>
              );
            })}
          </ul>
        </section>
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
