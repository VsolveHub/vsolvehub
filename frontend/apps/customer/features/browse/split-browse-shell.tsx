"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@vsolve/ui";
import { ChevronLeft, ChevronRight, Headphones, SlidersHorizontal, X, type LucideIcon } from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { ServicePhoto } from "@/features/catalog/components/category-artwork";

import type { BrowseTile } from "./taxonomy-tiles";

const SIDEBAR_TILE_CAP = 6;
const MODAL_ANIMATION_MS = 220;

export interface TrustBadgeItem {
  label: string;
  icon: LucideIcon;
}

/** First two rows of the 3-column sidebar, keeping the active tile visible. */
function sidebarTilesForDisplay(tiles: readonly BrowseTile[], activeSlug: string): BrowseTile[] {
  if (tiles.length <= SIDEBAR_TILE_CAP) return [...tiles];
  const head = tiles.slice(0, SIDEBAR_TILE_CAP);
  if (head.some((tile) => tile.slug === activeSlug)) return head;
  const active = tiles.find((tile) => tile.slug === activeSlug);
  if (!active) return head;
  return [...head.slice(0, SIDEBAR_TILE_CAP - 1), active];
}

function SeeAllTilesModal({
  open,
  onOpenChange,
  title,
  subtitle,
  tiles,
  onSelectTile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  tiles: readonly BrowseTile[];
  onSelectTile: (slug: string) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), MODAL_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const requestClose = useCallback(() => {
    if (!open) return;
    onOpenChange(false);
  }, [open, onOpenChange]);

  const pickTile = useCallback(
    (slug: string) => {
      onOpenChange(false);
      window.setTimeout(() => {
        onSelectTile(slug);
      }, MODAL_ANIMATION_MS);
    },
    [onOpenChange, onSelectTile],
  );

  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, requestClose]);

  useEffect(() => {
    if (!visible) return;
    closeButtonRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close all categories popup"
        className={cn(
          "absolute inset-0 bg-black/55 backdrop-blur-[2px] motion-reduce:transition-none",
          "transition-opacity duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={requestClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="see-all-browse-tiles-title"
        className={cn(
          "relative z-10 flex min-h-0 w-[min(100%,44rem)] max-h-[min(70dvh,calc(100dvh-4rem))] flex-col overflow-hidden rounded-[1.35rem] border border-[#e7e2da] bg-white shadow-2xl motion-reduce:transition-none motion-reduce:transform-none",
          "transition-[opacity,transform] duration-200 ease-out",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2
              id="see-all-browse-tiles-title"
              className="text-[1.35rem] font-extrabold tracking-tight text-navy-900"
            >
              {title}
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-[#EA580C]">{subtitle}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-navy-900 transition-colors hover:bg-[#F3F4F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
          <ul className="grid list-none grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3.5 p-0">
            {tiles.map((tile) => (
              <li key={tile.slug} className="min-w-0">
                <button
                  type="button"
                  onClick={() => pickTile(tile.slug)}
                  className="group flex h-full w-full flex-col rounded-[1rem] border border-[#e7e2da] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] duration-150 hover:border-navy-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring cursor-pointer"
                >
                  <span className="block w-full rounded-[0.85rem] bg-[#F6F3EE] p-1.5">
                    <ServicePhoto
                      imageUrl={tile.imageUrl}
                      iconKey={tile.iconKey}
                      className="shadow-none"
                    />
                  </span>
                  <span className="mt-2 flex min-w-0 items-center justify-between gap-1.5">
                    <span className="line-clamp-2 text-[12px] font-bold leading-tight text-navy-900">
                      {tile.name}
                    </span>
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-[#F3F4F6] text-navy-700 transition-colors group-hover:bg-[#FFF0E5] group-hover:text-[#EA580C]"
                    >
                      <ChevronRight className="size-3.5" strokeWidth={2.2} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface SplitBrowseShellProps {
  /** Left sidebar headline (e.g. "Rentals", "Stays"). */
  sidebarTitle: string;
  /** Left sidebar short subtitle. */
  sidebarDescription: string;
  /** Label inside the divider above the 3-column tile selector. */
  selectLabel?: string;
  /** Label for the "See all" button & modal when > 6 tiles exist. */
  seeAllLabel?: string;
  seeAllModalTitle: string;
  seeAllModalSubtitle: string;
  /** Back link label shown above the center hero (e.g. "Equipment Rentals"). */
  backLabel: string;
  backHref?: string;
  /** Optional header action (e.g., "My bookings" link when authenticated). */
  headerAction?: ReactNode;
  tiles: readonly BrowseTile[];
  activeTile: BrowseTile;
  onSelectTile: (slug: string) => void;
  /** Rendered below the 3-column tile grid inside the scrollable sidebar (and in the mobile filter sheet). */
  sidebarFilters: ReactNode;
  /** Active filter count badge shown on the mobile "Filters" button. */
  activeFilterCount?: number;
  /** Center hero subtitle line (e.g. "12 items found"). */
  heroSummary: string;
  trustBadges: readonly TrustBadgeItem[];
  /** Optional toolbar rendered below trust badges and above the card list (e.g. NearbyNotice, Sort). */
  centerToolbar?: ReactNode;
  /** Card list, loading skeleton, empty/error states, and LoadMore. */
  centerContent: ReactNode;
  /** Whether the right-side detail/booking drawer is open. */
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  /** Desktop drawer body (400px card) and mobile bottom-sheet body. */
  drawerContent: ReactNode;
}

export function SplitBrowseShell({
  sidebarTitle,
  sidebarDescription,
  selectLabel = "Select a category",
  seeAllLabel = "See all categories",
  seeAllModalTitle,
  seeAllModalSubtitle,
  backLabel,
  backHref = "/",
  headerAction,
  tiles,
  activeTile,
  onSelectTile,
  sidebarFilters,
  activeFilterCount = 0,
  heroSummary,
  trustBadges,
  centerToolbar,
  centerContent,
  drawerOpen,
  onCloseDrawer,
  drawerContent,
}: SplitBrowseShellProps) {
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  const visibleTiles = sidebarTilesForDisplay(tiles, activeTile.slug);
  const showSeeAll = tiles.length > SIDEBAR_TILE_CAP;

  // Lock root scroll on desktop (`lg+`) so only the split panes scroll independently.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      setIsDesktop(media.matches);
      document.documentElement.style.overflow = media.matches ? "hidden" : "";
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      document.documentElement.style.overflow = "";
    };
  }, []);

  // Close drawer / mobile filter sheet on Escape.
  useEffect(() => {
    if (!drawerOpen && !mobileFiltersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobileFiltersOpen) setMobileFiltersOpen(false);
        else if (drawerOpen) onCloseDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, mobileFiltersOpen, onCloseDrawer]);

  return (
    <>
      {/* ====================================================================
          DESKTOP SPLIT-PANE LAYOUT (lg+, >= 1024px)
          ==================================================================== */}
      <div className="hidden lg:flex fixed inset-x-0 bottom-0 top-16 z-10 bg-[#FAF9F7]">
        {/* Left Navigation + Filters Sidebar */}
        <nav
          aria-label={`${sidebarTitle} categories and filters`}
          className="flex h-full w-[22rem] shrink-0 flex-col border-r border-[#e7e2da] bg-white"
        >
          <div className="shrink-0 px-5 pb-1 pt-6">
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 text-[2rem] font-extrabold leading-[1.05] tracking-tight text-navy-900">
                {sidebarTitle}
              </h2>
              {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
            </div>
            {sidebarDescription.trim() !== "" ? (
              <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-text-secondary">
                {sidebarDescription}
              </p>
            ) : null}
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3">
            {/* 3-Column Category / Filter Tile Selector */}
            <section
              aria-labelledby="desktop-browse-select-label"
              className="rounded-[1.25rem] border border-[#e7e2da] px-3.5 pb-4 pt-3.5"
            >
              <div className="mb-4 flex items-center gap-3">
                <h3
                  id="desktop-browse-select-label"
                  className="shrink-0 text-[13px] font-medium text-text-secondary"
                >
                  {selectLabel}
                </h3>
                <div className="h-px min-w-0 flex-1 bg-[#e7e2da]" />
              </div>

              <ul className="grid list-none grid-cols-3 gap-x-2 gap-y-4 p-0">
                {visibleTiles.map((tile) => {
                  const active = tile.slug === activeTile.slug;
                  return (
                    <li key={tile.slug} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectTile(tile.slug)}
                        aria-current={active ? "page" : undefined}
                        className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        <span
                          className={cn(
                            "block w-full rounded-[1.1rem] p-1 transition-colors",
                            active
                              ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                              : "border-2 border-transparent hover:bg-[#FAF9F7]",
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
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {showSeeAll ? (
              <button
                type="button"
                onClick={() => setSeeAllOpen(true)}
                className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-navy-900 bg-white text-[13px] font-bold text-navy-900 transition-colors hover:bg-[#FAF9F7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {seeAllLabel}
                <span aria-hidden>→</span>
              </button>
            ) : null}

            {/* Stacked Sidebar Filters (Search, Location, Rate Slider, Toggles) */}
            <div className="mt-4 flex flex-col gap-3">{sidebarFilters}</div>
          </div>

          {/* Pinned Need Help Card */}
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

        {/* Center Content + Right Slide-In Drawer */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <section
            aria-labelledby={`desktop-browse-tile-${activeTile.slug}`}
            className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-8 py-6"
          >
            <Link
              href={backHref}
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
              {backLabel}
            </Link>

            <div className="mt-3 flex items-start justify-between gap-8">
              <div className="min-w-0 max-w-xl">
                <h1
                  id={`desktop-browse-tile-${activeTile.slug}`}
                  className="text-[1.85rem] font-extrabold tracking-tight text-navy-900"
                >
                  {activeTile.name}
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
                  {activeTile.description.trim() !== "" ? activeTile.description : heroSummary}
                </p>
              </div>
              {activeTile.imageUrl !== "" ? (
                <span className="flex h-28 w-40 shrink-0 items-center justify-center">
                  <RemoteImage
                    src={activeTile.imageUrl}
                    alt=""
                    width={160}
                    height={112}
                    className="max-h-full max-w-full object-contain"
                  />
                </span>
              ) : null}
            </div>

            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {trustBadges.map((badge) => (
                <li
                  key={badge.label}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-navy-800"
                >
                  <badge.icon className="size-4 text-navy-700" strokeWidth={1.8} />
                  {badge.label}
                </li>
              ))}
            </ul>

            {centerToolbar ? <div className="mt-5">{centerToolbar}</div> : null}

            <div className="mt-6">{centerContent}</div>
          </section>

          {/* Right Slide-in Drawer */}
          <div
            className={cn(
              "absolute inset-y-0 right-0 z-20 h-full shrink-0 overflow-hidden py-4 pr-4 transition-[width,opacity] duration-200 ease-out xl:static",
              drawerOpen ? "w-[416px] opacity-100" : "w-0 py-0 pr-0 opacity-0",
            )}
          >
            {drawerOpen && isDesktop ? drawerContent : null}
          </div>
        </div>

        <SeeAllTilesModal
          open={seeAllOpen}
          onOpenChange={setSeeAllOpen}
          title={seeAllModalTitle}
          subtitle={seeAllModalSubtitle}
          tiles={tiles}
          onSelectTile={onSelectTile}
        />
      </div>

      {/* ====================================================================
          MOBILE / TABLET LAYOUT (< lg, < 1024px)
          ==================================================================== */}
      <main className="lg:hidden mx-auto w-full max-w-[1360px] px-2 sm:px-4 md:px-6 pt-2 pb-1 h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
        <header className="shrink-0 flex items-center justify-between gap-2 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href={backHref}
              aria-label="Back to home"
              className="inline-flex min-h-8 shrink-0 items-center gap-0.5 text-xs sm:text-sm font-bold text-signal-700 hover:text-signal-800 transition-colors"
            >
              <ChevronLeft className="size-4 shrink-0" strokeWidth={2.5} />
              <span className="hidden min-[420px]:inline">Home</span>
            </Link>
            <h1 className="min-w-0 truncate px-1 text-[17px] min-[400px]:text-[19px] font-extrabold tracking-tight text-text">
              {sidebarTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 min-[400px]:gap-2">
            {headerAction}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="relative inline-flex h-8 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-full border border-line bg-white px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold text-navy-900 shadow-2xs hover:bg-surface-sunken cursor-pointer"
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 ? (
                <span className="grid size-4 place-items-center rounded-full bg-[#EA580C] text-[10px] font-extrabold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <div className="flex items-start gap-2 sm:gap-4 h-full min-h-0 flex-1">
          {/* Left Vertical Category Rail */}
          <nav
            aria-label={`${sidebarTitle} categories`}
            className="w-[74px] min-[400px]:w-20 sm:w-24 shrink-0 h-full overflow-y-auto overflow-x-hidden no-scrollbar border-r border-line/80 pr-1.5 min-[400px]:pr-2 sm:pr-3 pb-16"
          >
            <ul className="flex flex-col gap-2 list-none p-0 m-0">
              {tiles.map((tile) => {
                const isActive = tile.slug === activeTile.slug;
                return (
                  <li key={tile.slug}>
                    <button
                      type="button"
                      onClick={() => onSelectTile(tile.slug)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl py-2.5 px-1 text-center transition-all duration-150 group",
                        isActive
                          ? "bg-[#FFF8F3] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r before:bg-signal-500"
                          : "bg-[#F8F9FA] hover:bg-[#F0F1F3]",
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
                          imageUrl=""
                          iconKey={tile.iconKey}
                          className="size-12"
                        />
                      )}
                      <span
                        className={cn(
                          "w-full min-w-0 break-words line-clamp-2 text-[10px] sm:text-[11px] font-bold leading-tight px-0.5",
                          isActive ? "text-signal-700" : "text-navy-900",
                        )}
                      >
                        {tile.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Right Scrollable Listings Column */}
          <section
            aria-labelledby={`mobile-browse-tile-${activeTile.slug}`}
            className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden no-scrollbar pl-1 sm:pl-2 pb-16 flex flex-col gap-3"
          >
            <div className="flex items-baseline justify-between gap-2 pb-1 border-b border-line/60 shrink-0">
              <h2
                id={`mobile-browse-tile-${activeTile.slug}`}
                className="min-w-0 truncate text-lg sm:text-2xl font-extrabold tracking-tight text-navy-900"
              >
                {activeTile.name}
              </h2>
              <span className="text-xs font-semibold text-text-secondary shrink-0 whitespace-nowrap">
                {heroSummary}
              </span>
            </div>

            {centerToolbar ? <div>{centerToolbar}</div> : null}
            <div>{centerContent}</div>
          </section>
        </div>

        {/* Mobile Filters Bottom Sheet */}
        {mobileFiltersOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${sidebarTitle} filters`}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileFiltersOpen(false);
            }}
          >
            <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-line bg-surface p-4 sm:p-5 shadow-2xl max-h-[calc(85dvh-4rem)] sm:max-h-[85dvh] flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-line pb-3 shrink-0">
                <h3 className="text-base font-extrabold text-navy-900">
                  Filter {sidebarTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  aria-label="Close filters"
                  className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface-sunken cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="overflow-y-auto min-h-0 flex-1 pr-1 no-scrollbar">
                <div className="flex flex-col gap-3">{sidebarFilters}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="mt-1 h-10 w-full shrink-0 rounded-xl bg-navy-900 text-xs font-bold text-white cursor-pointer"
              >
                Show Results
              </button>
            </div>
          </div>
        ) : null}

        {/* Mobile Quick-Book / Enquiry Modal */}
        {drawerOpen && !isDesktop ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) onCloseDrawer();
            }}
          >
            <div className="w-full max-w-lg max-h-[calc(88dvh-4rem)] sm:max-h-[88dvh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl shadow-2xl">
              {drawerContent}
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
