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
import { useCustomerSession } from "@/features/session/queries";
import type { StayProperty, StayPropertySummary } from "@/features/stays/model";
import { fetchStays, fetchStayTaxonomy } from "@/features/stays/queries";
import {
  StayDetailDrawer,
  StayRowCard,
  StaySidebarFilters,
} from "@/features/stays/view";
import { STAY_CATEGORY_SLUG } from "@/lib/routes";

const STAY_TRUST_BADGES: readonly TrustBadgeItem[] = [
  { label: "Verified hosts & properties", icon: ShieldCheck },
  { label: "Instant date quotes", icon: Tag },
  { label: "Direct host communication", icon: BadgeCheck },
];

function StaysBrowseContent() {
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
  const [sort, setSort] = useState("newest");
  const [ac, setAc] = useState<boolean | undefined>(undefined);
  const [food, setFood] = useState<boolean | undefined>(undefined);
  const [tenantPreference, setTenantPreference] = useState<string | undefined>(undefined);
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [selectedProperty, setSelectedProperty] = useState<StayProperty | StayPropertySummary | null>(null);

  const categoriesQuery = useCategories();
  const stayCategory = useMemo(
    () => (categoriesQuery.data ?? []).find((cat) => cat.slug === STAY_CATEGORY_SLUG),
    [categoriesQuery.data],
  );

  const taxonomyQuery = useQuery({
    queryKey: ["stayTaxonomy"],
    queryFn: fetchStayTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const tiles = useMemo(
    () =>
      buildBrowseTiles({
        taxonomy: (taxonomyQuery.data ?? []) as TaxonomySubcategoryInput[],
        category: stayCategory,
        allLabel: "All Stays",
        allDescription:
          "Verified coliving, PG accommodation, hostels, and short stay rooms with direct host communication.",
        fallbackIconKey: "service",
      }),
    [taxonomyQuery.data, stayCategory],
  );

  const activeTile = useMemo(
    () => tiles.find((tile) => tile.slug === selectedTileSlug) ?? tiles[0]!,
    [tiles, selectedTileSlug],
  );

  const handleSelectTile = (slug: string) => {
    setSelectedTileSlug(slug);
    setServiceSlug(undefined);
    setSelectedProperty(null);
    const nextHref = slug === ALL_TILE_SLUG ? "/stays" : `/stays?tile=${encodeURIComponent(slug)}`;
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
    setSort("newest");
    setAc(undefined);
    setFood(undefined);
    setTenantPreference(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setSelectedProperty(null);
    router.replace("/stays", { scroll: false });
  };

  const activeServiceParam =
    serviceSlug ?? (activeTile.slug !== ALL_TILE_SLUG ? activeTile.slug : undefined);

  const {
    items: stays,
    isLoading,
    error,
    refetch,
    hasMore,
    loadMore,
    loadingMore,
  } = useBrowseList(
    [
      "stays",
      appliedQuery,
      placeKey(appliedPlace),
      ac,
      food,
      minPrice,
      maxPrice,
      tenantPreference,
      activeServiceParam,
      sort,
    ],
    (offset, limit) =>
      fetchStays({
        q: appliedQuery,
        ...placeQuery(appliedPlace),
        ac,
        food,
        min_price: minPrice,
        max_price: maxPrice,
        tenant_preference: tenantPreference,
        service: activeServiceParam,
        sort,
        limit,
        offset,
      }),
  );

  const activeFilterCount =
    (appliedQuery.trim() ? 1 : 0) +
    (appliedPlace.name.trim() || appliedPlace.latitude !== null ? 1 : 0) +
    (ac ? 1 : 0) +
    (food ? 1 : 0) +
    (tenantPreference ? 1 : 0) +
    (serviceSlug ? 1 : 0) +
    (minPrice !== undefined || maxPrice !== undefined ? 1 : 0);

  const hasAnyFilter =
    activeFilterCount > 0 || activeTile.slug !== ALL_TILE_SLUG || sort !== "newest";

  const heroSummary = isLoading
    ? "Loading stays…"
    : `${stays.length} ${stays.length === 1 ? "property" : "properties"} available`;

  const myBookingsLink = session.isAuthenticated ? (
    <Link
      href="/activity?type=stays"
      className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e7e2da] bg-[#FAF9F7] px-2.5 sm:px-3 text-[11px] font-bold text-navy-900 transition-colors hover:border-navy-300"
    >
      <FileCheck2 className="size-3.5 shrink-0 text-[#EA580C]" />
      <span className="hidden min-[400px]:inline">My bookings</span>
      <span className="min-[400px]:hidden">Bookings</span>
    </Link>
  ) : null;

  return (
    <SplitBrowseShell
      sidebarTitle="Stays"
      sidebarDescription="Rooms, PG accommodation, hostels & co-living spaces with verified hosts."
      selectLabel="Select stay type"
      seeAllLabel="See all stay types"
      seeAllModalTitle="All Stay Categories"
      seeAllModalSubtitle="Explore all rooms, PG & short stays available on V Solve Hub"
      backLabel="Home"
      backHref="/"
      headerAction={myBookingsLink}
      tiles={tiles}
      activeTile={activeTile}
      onSelectTile={handleSelectTile}
      activeFilterCount={activeFilterCount}
      sidebarFilters={
        <StaySidebarFilters
          draftQuery={draftQuery}
          onDraftQueryChange={setDraftQuery}
          draftPlace={draftPlace}
          appliedPlace={appliedPlace}
          onPlaceChange={handlePlaceChange}
          onSearchSubmit={handleSearchSubmit}
          sort={sort}
          onSortChange={setSort}
          ac={ac}
          onToggleAc={() => setAc((v) => (v ? undefined : true))}
          food={food}
          onToggleFood={() => setFood((v) => (v ? undefined : true))}
          tenantPreference={tenantPreference}
          onTenantPreferenceChange={setTenantPreference}
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
      trustBadges={STAY_TRUST_BADGES}
      centerToolbar={
        !isLoading && !error && sort === "newest" ? (
          <NearbyNotice
            place={appliedPlace}
            noun="stays"
            count={stays.length}
            nearestKm={stays[0]?.distance_km}
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
            title="Could not load stay properties"
            message={(error as Error).message}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : stays.length === 0 ? (
          <EmptyState
            title="No stay properties found"
            description="Try switching stay categories or broadening your filters."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Reset Filters
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3 pb-6">
            <ul className="flex list-none flex-col gap-3 p-0 m-0">
              {stays.map((property) => (
                <li key={property.id}>
                  <StayRowCard property={property} onQuickCheck={setSelectedProperty} />
                </li>
              ))}
            </ul>
            {stays.length > 0 ? (
              <LoadMore
                hasMore={hasMore}
                loading={loadingMore}
                onLoadMore={loadMore}
                label="Show more stays"
              />
            ) : null}
          </div>
        )
      }
      drawerOpen={selectedProperty !== null}
      onCloseDrawer={() => setSelectedProperty(null)}
      drawerContent={
        selectedProperty ? (
          <StayDetailDrawer
            key={selectedProperty.id}
            property={selectedProperty}
            onClose={() => setSelectedProperty(null)}
          />
        ) : null
      }
    />
  );
}

export default function StaysBrowsePage() {
  return (
    <Suspense fallback={null}>
      <StaysBrowseContent />
    </Suspense>
  );
}
