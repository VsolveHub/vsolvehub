"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCheck2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { fetchListingFilters, fetchListings, type Listing } from "@/features/listings/queries";
import { ListingFilters, ListingRow } from "@/features/listings/view";

export default function ListingsBrowsePage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const commitDrafts = useCallback(() => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  }, [draftQuery, draftLocation]);

  const selectCategory = (value: string) => {
    commitDrafts();
    setSelectedCategory(value);
  };

  const clearAllFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");
    setSelectedCategory("");
  };

  const { data: filtersData } = useQuery({
    queryKey: ["listing-filters"],
    queryFn: fetchListingFilters,
    staleTime: 60_000,
  });

  const {
    data: listings = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["listings", appliedQuery, appliedLocation, selectedCategory],
    queryFn: () =>
      fetchListings({
        q: appliedQuery,
        location: appliedLocation,
        service: selectedCategory,
      }),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });

  const hasActiveFilters = Boolean(draftQuery || draftLocation || selectedCategory);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      {/* Hero / Header Section */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-6 text-warm-0 shadow-raised sm:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-navy-300/30 bg-navy-500/15 px-3 py-1 text-xs font-semibold text-navy-200">
              <Sparkles className="size-3.5" />
              Verified Career Opportunities
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-warm-0 sm:text-4xl lg:text-5xl">
              Find Your Next Role
            </h1>
            <p className="text-sm text-warm-200 sm:text-base">
              Explore direct opportunities with verified hiring employers. Privacy-protected
              contact sharing and direct application status updates.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/listings/my-applications"
              className="inline-flex items-center gap-2 rounded-control border border-warm-0/20 bg-warm-0/10 px-4 py-2.5 text-sm font-semibold text-warm-0 backdrop-blur-xs transition hover:bg-warm-0/20"
            >
              <FileCheck2 className="size-4 text-warm-100" />
              My Applications
            </Link>
          </div>
        </div>

        {/* Search & Location Bar */}
        <div className="relative z-10 mt-8 grid gap-3 rounded-control bg-surface p-2.5 shadow-raised md:grid-cols-[1fr_260px_auto]">
          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5 focus-within:border-line-strong">
            <Search className="size-4 shrink-0 text-text-muted" />
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitDrafts();
              }}
              className="h-11 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              placeholder="Job title, keyword, skill, or employer..."
            />
          </label>

          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5 focus-within:border-line-strong">
            <MapPin className="size-4 shrink-0 text-text-muted" />
            <input
              value={draftLocation}
              onChange={(event) => setDraftLocation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitDrafts();
              }}
              className="h-11 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              placeholder="City, area, or remote..."
            />
          </label>

          <Button
            type="button"
            onClick={commitDrafts}
            className="h-11 px-6 font-semibold"
          >
            <Search className="size-4" />
            {isFetching ? "Searching..." : "Search"}
          </Button>
        </div>
      </section>

      {/* Filter Pills */}
      <ListingFilters
        categories={filtersData?.categories}
        selectedCategory={selectedCategory}
        onSelectCategory={selectCategory}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
      />

      {/* Error Notice */}
      {error ? (
        <ErrorState
          title="Could not load job listings"
          message={(error as Error).message || "An unexpected error occurred while fetching listings."}
        />
      ) : null}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-36 rounded-card border border-line" />
          ))}
        </div>
      ) : null}

      {/* Empty State */}
      {!isLoading && listings.length === 0 ? (
        <EmptyState
          title="No career listings found"
          description="We couldn't find any active job listings matching your search criteria. Try modifying your search keywords or location."
          action={
            <Button type="button" variant="secondary" onClick={clearAllFilters}>
              Reset Filters
            </Button>
          }
        />
      ) : null}

      {/* Listings Grid */}
      <section className="grid gap-4">
        {listings.map((listing: Listing) => (
          <ListingRow key={listing.id} listing={listing} />
        ))}
      </section>
    </main>
  );
}
