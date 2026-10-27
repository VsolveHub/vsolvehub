"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBrowseList } from "@vsolve/query";
import { ArrowLeft, FileCheck2, Search, Wrench } from "lucide-react";
import { Button, EmptyState, ErrorState, LoadMore, Skeleton } from "@vsolve/ui";
import { EMPTY_PLACE, PlaceFilter, type PlaceFilterValue } from "@vsolve/ui/location-picker";

import { NearbyNotice, placeKey, placeQuery } from "@/features/browse/nearby";
import { GOOGLE_MAPS_KEY } from "@/lib/google-maps";

import { fetchRentals } from "@/features/rentals/queries";
import { useCustomerSession } from "@/features/session/queries";
import { type ActiveRentalFilters, RentalCard, RentalFilters } from "@/features/rentals/view";

function RentalsBrowseContent() {
  const session = useCustomerSession();
  const searchParams = useSearchParams();
  const initCategory = searchParams.get("category") ?? undefined;

  const [draftQuery, setDraftQuery] = useState("");
  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [filters, setFilters] = useState<ActiveRentalFilters>(
    initCategory ? { categorySlug: initCategory } : {},
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
  };

  /** A picked suggestion or Near me searches at once; typing waits for the Search button. */
  const changePlace = (next: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(next);
    if (applyNow) {
      setAppliedQuery(draftQuery);
      setAppliedPlace(next);
    }
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);
    setFilters({});
  };

  /**
   * The server sends one page at a time (24, newest first) and "Show more" asks for the next.
   * Every filter is in the key, so changing one starts again from the first page.
   */
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
      filters.categorySlug,
      filters.serviceSlug,
      filters.minPrice,
      filters.maxPrice,
    ],
    (offset, limit) =>
      fetchRentals({
        q: appliedQuery,
        ...placeQuery(appliedPlace),
        service: filters.serviceSlug,
        category: filters.categorySlug,
        min_price: filters.minPrice,
        max_price: filters.maxPrice,
        limit,
        offset,
      }),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6 px-4 pt-3 pb-8 sm:py-8">
      <div>
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-bold text-text-secondary hover:text-text transition"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      {/* Hero / Header Section */}
      <section className="relative z-20 rounded-[var(--radius-card)] bg-[#000817] bg-gradient-to-br from-navy-950 via-navy-900 to-navy-900 p-6 text-white shadow-raised sm:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-navy-400/30 bg-navy-800/60 px-3 py-1 text-xs font-semibold text-navy-200">
              <Wrench className="size-3.5" />
              Verified Tools &amp; Equipment Rentals
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Rent Tools &amp; Equipment
            </h1>
            <p className="text-sm text-navy-100/90 sm:text-base">
              Rent certified power tools, carpentry kits, and equipment with verified partners.
              100% refundable security deposit and transparent daily rates.
            </p>
          </div>

          {/* Only once signed in: before that there is nothing of theirs to show, and the
              page would only send them to log in. */}
          {session.isAuthenticated ? (
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/rentals/mine"
              className="inline-flex items-center gap-2 rounded-control border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-xs transition hover:bg-white/20"
            >
              <FileCheck2 className="size-4 text-warm-100" />
              My Rentals
            </Link>
          </div>
          ) : null}
        </div>

        {/* Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="relative z-10 mt-8 grid gap-3 rounded-control bg-surface p-2.5 shadow-raised md:grid-cols-[1fr_320px_auto]"
        >
          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5 focus-within:border-line-strong">
            <Search className="size-4 shrink-0 text-text-secondary" />
            <input
              type="search"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search tools (e.g. Bosch Drill, Angle Grinder, Carpentry Kit)"
              className="w-full bg-transparent py-2.5 text-base sm:text-sm text-text placeholder:text-text-secondary/70 focus:outline-none"
            />
          </label>

          <PlaceFilter
            apiKey={GOOGLE_MAPS_KEY}
            value={draftPlace}
            onChange={changePlace}
            placeholder="Location (e.g. Hyderabad)"
          />

          <Button type="submit" className="min-h-11 px-6 font-bold sm:h-full">
            Search Gear
          </Button>
        </form>
      </section>

      <RentalFilters
        activeFilters={filters}
        onChangeFilter={setFilters}
        count={isLoading ? null : rentals.length}
      />

      {!isLoading && !error ? (
        <NearbyNotice
          place={appliedPlace}
          noun="rentals"
          count={rentals.length}
          nearestKm={rentals[0]?.distance_km}
        />
      ) : null}

      {/* State Rendering */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-5">
              <Skeleton className="h-44 w-full rounded-card" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
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
          description="Try broadening your search query or location filter."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Reset Filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rentals.map((asset) => (
              <RentalCard key={asset.id} asset={asset} />
            ))}
          </div>
          <LoadMore
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
            label="Show more rentals"
          />
        </>
      )}
    </main>
  );
}

export default function RentalsBrowsePage() {
  return (
    <Suspense fallback={null}>
      <RentalsBrowseContent />
    </Suspense>
  );
}

