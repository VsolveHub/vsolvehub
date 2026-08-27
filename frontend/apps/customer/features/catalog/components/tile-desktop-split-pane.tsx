"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, cn } from "@vsolve/ui";
import {
  BadgeCheck,
  ChevronRight,
  Clock,
  Headphones,
  ShieldCheck,
  Tag,
} from "lucide-react";

import { useServiceDetail, type Category, type ServiceCard } from "../client-queries";
import { ServicePhoto } from "./category-artwork";
import {
  categoryHeadline,
  displayCategoryStats,
  displayRating,
  earliestSlotLabel,
} from "./tile-desktop-rating";
import { TileCatalogAddButton } from "./tile-catalog-add-button";
import { TileServiceDetailPanel } from "./tile-service-detail-panel";

type DesktopTile = {
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  imageUrl: string;
  services: ServiceCard[];
};

const SIDEBAR_TILE_CAP = 6;

const TRUST_BADGES = [
  { label: "Verified Professionals", icon: ShieldCheck },
  { label: "On-time Service", icon: Clock },
  { label: "Transparent Pricing", icon: Tag },
  { label: "Satisfaction Guarantee", icon: BadgeCheck },
] as const;

/** First two rows of the 3-column sidebar, keeping the active tile visible. */
function sidebarTilesForDisplay(tiles: DesktopTile[], activeSlug: string): DesktopTile[] {
  if (tiles.length <= SIDEBAR_TILE_CAP) return tiles;
  const head = tiles.slice(0, SIDEBAR_TILE_CAP);
  if (head.some((tile) => tile.slug === activeSlug)) return head;
  const active = tiles.find((tile) => tile.slug === activeSlug);
  if (!active) return head;
  return [...head.slice(0, SIDEBAR_TILE_CAP - 1), active];
}

function SidebarEarliestBadge() {
  return (
    <div className="shrink-0 rounded-[0.9rem] bg-success-surface px-2.5 py-2 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-success-text">
        <Clock className="size-3" strokeWidth={2.2} aria-hidden />
        Earliest
      </p>
      <p className="mt-0.5 text-[12px] font-extrabold leading-none text-navy-900">
        {earliestSlotLabel()}
      </p>
    </div>
  );
}

function SidebarWarrantyCard() {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-[1.15rem] bg-[#F3F4F6] px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-success-text">
          <span className="grid size-3.5 place-items-center rounded-full bg-success-text text-white" aria-hidden>
            <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
              <path
                d="M2.5 6.2 4.8 8.5 9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          V SOLVE COVER
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-snug text-navy-900">
          Upto 30 days warranty on repairs
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-navy-300" strokeWidth={1.8} aria-hidden />
    </div>
  );
}

function includedSummary(items: string[] | undefined): string | null {
  if (!items || items.length === 0) return null;
  return items.slice(0, 3).join(", ");
}

function DesktopTileServiceCard({
  service,
  tile,
  categorySlug,
  onOpenPanel,
}: {
  service: ServiceCard;
  tile: DesktopTile;
  categorySlug: string;
  onOpenPanel: () => void;
}) {
  const detailQuery = useServiceDetail(service.slug);
  const rating = displayRating(service.slug);
  const included = includedSummary(
    (detailQuery.data?.policies ?? [])
      .filter((policy) => policy.kind === "INCLUDED")
      .map((policy) => policy.text),
  );
  const pricePaise = service.starting_price?.amount_paise ?? null;

  return (
    <article className="flex items-center gap-4 rounded-[1.25rem] border border-[#e7e2da] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="size-[5.5rem] shrink-0">
        <ServicePhoto
          imageUrl={service.cover?.url ?? tile.imageUrl}
          iconKey={service.icon_key}
        />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-extrabold leading-snug text-navy-900">{service.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-navy-900">
          <span className="text-[#F5A524]" aria-hidden>
            ★
          </span>
          <span>
            {rating.score}{" "}
            <span className="font-medium text-text-secondary">({rating.count})</span>
          </span>
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text-secondary">
          {service.short_description}
        </p>
        {included ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-text-secondary">
            <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border border-navy-300 text-navy-700">
              <svg viewBox="0 0 12 12" fill="none" className="size-2" aria-hidden>
                <path
                  d="M2.5 6.2 4.8 8.5 9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="line-clamp-1">
              <span className="font-semibold text-navy-800">Includes:</span> {included}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
        {pricePaise !== null ? (
          <div className="text-right">
            <span className="block text-[11px] font-medium text-text-secondary">Starts at</span>
            <span data-numeric className="block text-[15px] font-extrabold tabular-nums text-navy-900">
              {formatMoney(pricePaise)}
            </span>
          </div>
        ) : (
          <span className="text-[12px] font-bold text-navy-900">Price on request</span>
        )}
        <div className="flex items-center gap-2">
          <Link
            href={`/catalog/${categorySlug}/${service.slug}`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-navy-900 bg-white px-3.5 text-[13px] font-bold text-navy-900 transition-colors hover:bg-[#FAF9F7]"
          >
            View details
          </Link>
          <TileCatalogAddButton
            service={service}
            categorySlug={categorySlug}
            onNeedChoice={onOpenPanel}
          />
        </div>
      </div>
    </article>
  );
}

export function TileDesktopSplitPane({
  category,
  tiles,
  activeTile,
}: {
  category: Category;
  tiles: DesktopTile[];
  activeTile: DesktopTile;
}) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selectedService =
    activeTile.services.find((service) => service.slug === selectedSlug) ?? null;
  const visibleTiles = sidebarTilesForDisplay(tiles, activeTile.slug);
  const showSeeAll = tiles.length > SIDEBAR_TILE_CAP;
  const headline = categoryHeadline(category.name);
  const stats = displayCategoryStats(category.slug);

  useEffect(() => {
    setSelectedSlug(null);
  }, [activeTile.slug]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      document.documentElement.style.overflow = media.matches ? "hidden" : "";
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <div className="hidden lg:flex fixed inset-x-0 bottom-0 top-16 z-10 bg-[#FAF9F7]">
      <nav
        aria-label={`${category.name} services`}
        className="flex h-full w-[22rem] shrink-0 flex-col border-r border-[#e7e2da] bg-white"
      >
        <div className="shrink-0 px-5 pb-1 pt-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-[2rem] font-extrabold leading-[1.05] tracking-tight text-navy-900">
              {headline}
            </h2>
            <SidebarEarliestBadge />
          </div>
          <p className="mt-2 flex items-center gap-1 text-[13px] text-navy-900">
            <span className="text-[13px] leading-none" aria-hidden>
              ★
            </span>
            <span className="font-semibold">{stats.score}</span>
            <span className="underline decoration-navy-900/35 underline-offset-[3px]">
              ({stats.bookings})
            </span>
          </p>
          <SidebarWarrantyCard />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3">
          <section
            aria-labelledby={`desktop-select-${category.slug}`}
            className="rounded-[1.25rem] border border-[#e7e2da] px-3.5 pb-4 pt-3.5"
          >
            <div className="mb-4 flex items-center gap-3">
              <h3
                id={`desktop-select-${category.slug}`}
                className="shrink-0 text-[13px] font-medium text-text-secondary"
              >
                Select a service
              </h3>
              <div className="h-px min-w-0 flex-1 bg-[#e7e2da]" />
            </div>
            <ul className="grid list-none grid-cols-3 gap-x-2 gap-y-4 p-0">
              {visibleTiles.map((tile) => {
                const active = tile.slug === activeTile.slug;
                return (
                  <li key={tile.slug} className="min-w-0">
                    <Link
                      href={`/catalog/${category.slug}?tile=${tile.slug}`}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className="flex flex-col items-center gap-1.5 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <span
                        className={cn(
                          "block w-full rounded-[1.1rem] p-1",
                          active ? "border-2 border-[#EA580C] bg-[#FFF8F3]" : "border-2 border-transparent",
                        )}
                      >
                        <ServicePhoto imageUrl={tile.imageUrl} iconKey={tile.iconKey} />
                      </span>
                      <span
                        className={cn(
                          "line-clamp-2 w-full text-center text-[11px] font-semibold leading-tight",
                          active ? "text-navy-900" : "text-navy-800",
                        )}
                      >
                        {tile.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          {showSeeAll ? (
            <Link
              href={`/catalog/${category.slug}`}
              className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-navy-900 bg-white text-[13px] font-bold text-navy-900 transition-colors hover:bg-[#FAF9F7]"
            >
              See all services
              <span aria-hidden>→</span>
            </Link>
          ) : null}
        </div>
        <div className="shrink-0 p-4 pt-2">
          <div className="rounded-2xl border border-[#e7e2da] bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FAF9F7] text-navy-900">
                <Headphones className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold text-navy-900">Need help?</p>
                <p className="mt-0.5 text-[11px] font-medium text-text-secondary">
                  Talk to our experts
                </p>
              </div>
            </div>
            <Link
              href="/contact"
              className="mt-3 flex h-9 items-center justify-center rounded-lg border border-navy-900 text-[12px] font-bold text-navy-900 transition-colors hover:bg-[#FAF9F7]"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1">
        <section
          aria-labelledby={`desktop-tile-${activeTile.slug}`}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-8 py-6"
        >
          <Link
            href={`/catalog/${category.slug}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#EA580C] hover:text-[#C2410C]"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
              <path
                d="M12.5 4.5 7 10l5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {category.name}
          </Link>

          <div className="mt-3 flex items-start justify-between gap-8">
            <div className="min-w-0 max-w-xl">
              <h1
                id={`desktop-tile-${activeTile.slug}`}
                className="text-[1.85rem] font-extrabold tracking-tight text-navy-900"
              >
                {activeTile.name}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
                {activeTile.description.trim() !== ""
                  ? activeTile.description
                  : `Book expert ${activeTile.name} for installation, repair, service and maintenance at your doorstep.`}
              </p>
            </div>
            {activeTile.imageUrl !== "" ? (
              <span className="flex h-28 w-40 shrink-0 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeTile.imageUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              </span>
            ) : null}
          </div>

          <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {TRUST_BADGES.map((badge) => (
              <li
                key={badge.label}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-navy-800"
              >
                <badge.icon className="size-4 text-navy-700" strokeWidth={1.8} />
                {badge.label}
              </li>
            ))}
          </ul>

          <ul className="mt-6 flex list-none flex-col gap-3 p-0">
            {activeTile.services.map((service) => (
              <li key={service.id}>
                <DesktopTileServiceCard
                  service={service}
                  tile={activeTile}
                  categorySlug={category.slug}
                  onOpenPanel={() => setSelectedSlug(service.slug)}
                />
              </li>
            ))}
          </ul>
        </section>

        <div
          className={cn(
            "h-full shrink-0 overflow-hidden py-4 pr-4 transition-[width,opacity] duration-200 ease-out",
            selectedService ? "w-[416px] opacity-100" : "w-0 py-0 pr-0 opacity-0",
          )}
        >
          {selectedService ? (
            <TileServiceDetailPanel
              key={selectedService.slug}
              service={selectedService}
              categorySlug={category.slug}
              tileImageUrl={activeTile.imageUrl}
              onClose={() => setSelectedSlug(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
