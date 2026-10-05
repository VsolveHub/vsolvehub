"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  FileCheck2,
  MapPin,
  Search,
} from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { fetchStays } from "@/features/stays/queries";
import { roomCardsFrom } from "@/features/stays/room-cards";
import { type ActiveFilters, RoomCard, StayFilters } from "@/features/stays/view";

function StaysBrowseContent() {
  const searchParams = useSearchParams();
  const initCategory = searchParams.get("category") ?? undefined;

  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [sort, setSort] = useState("newest");
  const [filters, setFilters] = useState<ActiveFilters>(
    initCategory ? { categorySlug: initCategory } : {}
  );
  const [visible, setVisible] = useState(6);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
    setVisible(6);
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");
    setFilters({});
    setSort("newest");
    setVisible(6);
  };

  const {
    data: stays = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "stays",
      appliedQuery,
      appliedLocation,
      filters.ac,
      filters.food,
      filters.minPrice,
      filters.maxPrice,
      filters.tenantPreference,
      filters.categorySlug,
      filters.serviceSlug,
      sort,
    ],
    queryFn: () =>
      fetchStays({
        q: appliedQuery,
        location: appliedLocation,
        ac: filters.ac,
        food: filters.food,
        min_price: filters.minPrice,
        max_price: filters.maxPrice,
        tenant_preference: filters.tenantPreference,
        service: filters.serviceSlug || filters.categorySlug,
        sort,
        limit: 100,
        offset: 0,
      }),
    staleTime: 30_000,
  });

  // One card per room type (two per property at most); rooms without a photo stay hidden.
  const rooms = roomCardsFrom(stays, {
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    ac: filters.ac,
    food: filters.food,
    sort,
  });
  const displayedRooms = rooms.slice(0, visible);


  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      {/* Hero / Header Section */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-6 text-warm-0 shadow-raised sm:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-navy-300/30 bg-navy-500/15 px-3 py-1 text-xs font-semibold text-navy-200">
              <Building2 className="size-3.5" />
              Verified Rooms, PG & Short Stays
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-warm-0 sm:text-4xl lg:text-5xl">
              Find Rooms, PG & Hotels
            </h1>
            <p className="text-sm text-warm-200 sm:text-base">
              Verified coliving, PG accommodation, and short stay rooms.
              Instant date quote calculations and direct host communication.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/stays/mine"
              className="inline-flex items-center gap-2 rounded-control border border-warm-0/20 bg-warm-0/10 px-4 py-2.5 text-sm font-semibold text-warm-0 backdrop-blur-xs transition hover:bg-warm-0/20"
            >
              <FileCheck2 className="size-4 text-warm-100" />
              My Enquiries
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="relative z-10 mt-8 grid gap-3 rounded-control bg-surface p-2.5 shadow-raised md:grid-cols-[1fr_260px_auto]"
        >
          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5 focus-within:border-line-strong">
            <Search className="size-4 shrink-0 text-text-secondary" />
            <input
              type="search"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search rooms or places (e.g. Lakeview PG, single room)"
              className="w-full bg-transparent py-2.5 text-sm text-text placeholder:text-text-secondary/70 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5 focus-within:border-line-strong">
            <MapPin className="size-4 shrink-0 text-text-secondary" />
            <input
              type="text"
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              placeholder="City or Area (e.g. Hyderabad, Gachibowli)"
              className="w-full bg-transparent py-2.5 text-sm text-text placeholder:text-text-secondary/70 focus:outline-none"
            />
          </label>

          <Button type="submit" className="h-full px-6 font-bold">
            Search Stays
          </Button>
        </form>
      </section>

      {/* Structured Filter Chips */}
      <StayFilters
        activeFilters={filters}
        onChangeFilter={setFilters}
        count={rooms.length}
      />

      {/* Results Header with Count & Sort */}
      {!isLoading && rooms.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3">
          <p className="text-sm font-semibold text-text">
            Showing <span className="font-bold text-action">{displayedRooms.length}</span> of{" "}
            <span className="font-bold">{rooms.length}</span> {rooms.length === 1 ? "room" : "rooms"}
            {appliedLocation ? ` in "${appliedLocation}"` : ""}
          </p>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <label htmlFor="stays-sort" className="text-xs font-medium text-text-secondary">
              Sort by:
            </label>
            <select
              id="stays-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setVisible(6);
              }}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition hover:border-line-strong focus:border-line-strong focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating_desc">Top Rated</option>
            </select>
          </div>
        </div>
      ) : null}

      {/* State Rendering */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-5">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load stay properties"
          message={(error as Error).message}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : rooms.length === 0 ? (
        <EmptyState
          title="No rooms found"
          description="Try broadening your filters or searching another area."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedRooms.map((card) => (
            <RoomCard key={card.key} card={card} />
          ))}
        </div>
      )}
      {rooms.length > visible ? (
        <div className="flex justify-center pt-4">
          <Button type="button" variant="secondary" onClick={() => setVisible((count) => count + 6)}>
            Load more ({rooms.length - visible} remaining)
          </Button>
        </div>
      ) : null}
    </main>
  );
}

export default function StaysBrowsePage() {
  return (
    <Suspense fallback={null}>
      <StaysBrowseContent />
    </Suspense>
  );
}
