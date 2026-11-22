"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useBrowseList } from "@vsolve/query";
import { BadgeCheck, FileCheck2, ShieldCheck, Tag } from "lucide-react";
import { Button, EmptyState, ErrorState, LoadMore, Skeleton } from "@vsolve/ui";
import { EMPTY_PLACE, type PlaceFilterValue } from "@vsolve/ui/location-picker";

import { NearbyNotice, placeKey, placeQuery } from "@/features/browse/nearby";
import { SplitBrowseShell, type TrustBadgeItem } from "@/features/browse/split-browse-shell";
import {
  ALL_TILE_SLUG,
  buildBrowseTiles,
  type TaxonomySubcategoryInput,
} from "@/features/browse/taxonomy-tiles";
import { useCategories } from "@/features/catalog/client-queries";
import type { RentalAsset } from "@/features/rentals/model";
import { fetchRentals, fetchRentalTaxonomy } from "@/features/rentals/queries";
import {
  RentalDetailDrawer,
  RentalRowCard,
  RentalSidebarFilters,
} from "@/features/rentals/view";
import { useCustomerSession } from "@/features/session/queries";
import { RENTAL_SERVICES_CATEGORY_SLUG } from "@/lib/routes";

const RENTAL_TRUST_BADGES: readonly TrustBadgeItem[] = [
  { label: "Verified tools & equipment", icon: ShieldCheck },
  { label: "Transparent daily rates", icon: Tag },
  { label: "Refundable security deposit", icon: BadgeCheck },
];

function RentalsBrowseContent() {
  const session = useCustomerSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTile = searchParams.get("tile") ?? searchParams.get("category") ?? ALL_TILE_SLUG;

  const [selectedTileSlug, setSelectedTileSlug] = useState<string>(urlTile);
  const [serviceSlug, setServiceSlug] = useState<string | undefined>(undefined);
  const [draftQuery, setDraftQuery] = useState("");
  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [selectedAsset, setSelectedAsset] = useState<RentalAsset | null>(null);

  const categoriesQuery = useCategories();
  const rentalCategory = useMemo(
    () =>
      (categoriesQuery.data ?? []).find((cat) => cat.slug === RENTAL_SERVICES_CATEGORY_SLUG),
    [categoriesQuery.data],
  );

  const taxonomyQuery = useQuery({
    queryKey: ["rentalTaxonomy"],
    queryFn: fetchRentalTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const tiles = useMemo(
    () =>
      buildBrowseTiles({
        taxonomy: (taxonomyQuery.data ?? []) as TaxonomySubcategoryInput[],
        category: rentalCategory,
        allLabel: "All Equipment",
        allDescription:
          "Rent certified power tools, event gear, and equipment with verified partners and transparent daily rates.",
        fallbackIconKey: "service",
      }),
    [taxonomyQuery.data, rentalCategory],
  );

  const activeTile = useMemo(
    () => tiles.find((tile) => tile.slug === selectedTileSlug) ?? tiles[0]!,
    [tiles, selectedTileSlug],
  );

  const handleSelectTile = (slug: string) => {
    setSelectedTileSlug(slug);
    setServiceSlug(undefined);
    setSelectedAsset(null);
    const nextHref = slug === ALL_TILE_SLUG ? "/rentals" : `/rentals?tile=${encodeURIComponent(slug)}`;
    router.replace(nextHref, { scroll: false });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
  };

  const handlePlaceChange = (next: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(next);
    if (applyNow) {
      setAppliedQuery(draftQuery);
      setAppliedPlace(next);
    }
  };

  const clearFilters = () => {
    setSelectedTileSlug(ALL_TILE_SLUG);
    setServiceSlug(undefined);
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setSelectedAsset(null);
    router.replace("/rentals", { scroll: false });
  };

  const activeServiceParam =
    serviceSlug ?? (activeTile.slug !== ALL_TILE_SLUG ? activeTile.slug : undefined);

  const {
    items: rentals,
    isLoading,
    error,
    refetch,
    hasMore,
    loadMore,
    loadingMore,
  } = useBrowseList(
    [
      "rentals",
      appliedQuery,
      placeKey(appliedPlace),
      activeServiceParam,
      minPrice,
      maxPrice,
    ],
    (offset, limit) =>
      fetchRentals({
        q: appliedQuery,
        ...placeQuery(appliedPlace),
        service: activeServiceParam,
        min_price: minPrice,
        max_price: maxPrice,
        limit,
        offset,
      }),
  );

  const activeFilterCount =
    (appliedQuery.trim() ? 1 : 0) +
    (appliedPlace.name.trim() || appliedPlace.latitude !== null ? 1 : 0) +
    (serviceSlug ? 1 : 0) +
    (minPrice !== undefined || maxPrice !== undefined ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0 || activeTile.slug !== ALL_TILE_SLUG;

  const heroSummary = isLoading
    ? "Loading equipment…"
    : `${rentals.length} ${rentals.length === 1 ? "item" : "items"} available`;

  const myBookingsLink = session.isAuthenticated ? (
    <Link
      href="/activity?type=rentals"
      className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e7e2da] bg-[#FAF9F7] px-2.5 sm:px-3 text-[11px] font-bold text-navy-900 transition-colors hover:border-navy-300"
    >
      <FileCheck2 className="size-3.5 shrink-0 text-[#EA580C]" />
      <span className="hidden min-[400px]:inline">My bookings</span>
      <span className="min-[400px]:hidden">Bookings</span>
    </Link>
  ) : null;

  return (
    <SplitBrowseShell
      sidebarTitle="Rentals"
      sidebarDescription="Tools, appliances & event equipment with refundable deposit protection."
      selectLabel="Select a category"
      seeAllLabel="See all categories"
      seeAllModalTitle="All Rental Categories"
      seeAllModalSubtitle="Explore all equipment categories available on V Solve Hub"
      backLabel="Home"
      backHref="/"
      headerAction={myBookingsLink}
      tiles={tiles}
      activeTile={activeTile}
      onSelectTile={handleSelectTile}
      activeFilterCount={activeFilterCount}
      sidebarFilters={
        <RentalSidebarFilters
          draftQuery={draftQuery}
          onDraftQueryChange={setDraftQuery}
          draftPlace={draftPlace}
          onPlaceChange={handlePlaceChange}
          onSearchSubmit={handleSearchSubmit}
          services={activeTile.services}
          activeServiceSlug={serviceSlug}
          onSelectService={setServiceSlug}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={(min, max) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
          hasActiveFilters={hasAnyFilter}
          onClearFilters={clearFilters}
        />
      }
      heroSummary={heroSummary}
      trustBadges={RENTAL_TRUST_BADGES}
      centerToolbar={
        !isLoading && !error ? (
          <NearbyNotice
            place={appliedPlace}
            noun="rentals"
            count={rentals.length}
            nearestKm={rentals[0]?.distance_km}
          />
        ) : null
      }
      centerContent={
        isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-28 w-full rounded-[1.25rem]" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            title="Could not load equipment rentals"
            message={(error as Error).message}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : rentals.length === 0 ? (
          <EmptyState
            title="No equipment rentals found"
            description="Try switching categories or broadening your search and rate filters."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Reset Filters
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3 pb-6">
            <ul className="flex list-none flex-col gap-3 p-0 m-0">
              {rentals.map((asset) => (
                <li key={asset.id}>
                  <RentalRowCard asset={asset} onQuickBook={setSelectedAsset} />
                </li>
              ))}
            </ul>
            <LoadMore
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={loadMore}
              label="Show more rentals"
            />
          </div>
        )
      }
      drawerOpen={selectedAsset !== null}
      onCloseDrawer={() => setSelectedAsset(null)}
      drawerContent={
        selectedAsset ? (
          <RentalDetailDrawer
            key={selectedAsset.id}
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
        ) : null
      }
    />
  );
}

export default function RentalsBrowsePage() {
  return (
    <Suspense fallback={null}>
      <RentalsBrowseContent />
    </Suspense>
  );
}
