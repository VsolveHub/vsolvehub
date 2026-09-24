"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCheck2,
  MapPin,
  Search,
} from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { fetchListingFilters, fetchListings, type Listing } from "@/features/listings/queries";
import { ListingOpportunityCard } from "@/features/listings/listing-opportunity-card";
import { ListingFilters } from "@/features/listings/view";
import { PartAHero, PartAPill, PartAResultHeader } from "@/features/part-a";

export default function ListingsBrowsePage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workMode, setWorkMode] = useState("");

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
    queryKey: ["listings", appliedQuery, appliedLocation, selectedCategory, employmentType, workMode],
    queryFn: () =>
      fetchListings({
        q: appliedQuery,
        location: appliedLocation,
        service: selectedCategory,
        sort: "latest",
        employment_type: employmentType,
        work_mode: workMode,
      }),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });

  const hasActiveFilters = Boolean(draftQuery || draftLocation || selectedCategory);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <PartAHero
        title="Find Your Next Opportunity"
        subtitle="Jobs from trusted employers. Build your career with V Solve Hub."
        image="/part-a/careers.svg"
        aside={
          <Link
            href="/listings/my-applications"
            className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-900"
          >
            <FileCheck2 className="size-4" />
            My Applications
          </Link>
        }
      >
        <div className="grid gap-3 rounded-control bg-surface p-2.5 shadow-raised md:grid-cols-[1fr_260px_auto]">
          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5">
            <Search className="size-4 shrink-0 text-text-muted" />
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitDrafts();
              }}
              className="h-11 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search jobs (e.g. accountant, developer)"
            />
          </label>
          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5">
            <MapPin className="size-4 shrink-0 text-text-muted" />
            <input
              value={draftLocation}
              onChange={(event) => setDraftLocation(event.target.value)}
              className="h-11 flex-1 bg-transparent text-sm outline-none"
              placeholder="Hyderabad"
            />
          </label>
          <Button type="button" onClick={commitDrafts} className="h-11 px-6 font-semibold">
            {isFetching ? "Searching..." : "Search Jobs"}
          </Button>
        </div>
      </PartAHero>

      <div className="flex flex-wrap gap-2">
        <PartAPill label="All jobs" active={!employmentType && !workMode} onClick={() => { setEmploymentType(""); setWorkMode(""); }} />
        <PartAPill label="Full-time" active={employmentType === "Full-Time"} onClick={() => setEmploymentType("Full-Time")} />
        <PartAPill label="On-site" active={workMode === "On-site"} onClick={() => setWorkMode("On-site")} />
      </div>

      <ListingFilters
        categories={filtersData?.categories}
        selectedCategory={selectedCategory}
        onSelectCategory={selectCategory}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
      />

      <PartAResultHeader
        count={listings.length}
        place={appliedLocation || "Hyderabad"}
        noun="jobs"
        sort="latest"
        onSort={() => undefined}
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
          <ListingOpportunityCard key={listing.id} listing={listing} />
        ))}
      </section>
    </main>
  );
}
