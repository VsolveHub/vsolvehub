"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  FileCheck2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import { fetchListings, type Listing } from "@/features/listings/queries";
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
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 p-6 text-white shadow-xl sm:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 backdrop-blur-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Verified Career Opportunities
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              Find Your Next Role
            </h1>
            <p className="text-sm text-slate-300 sm:text-base">
              Explore direct opportunities with verified hiring employers. Privacy-protected
              contact sharing and direct application status updates.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/listings/my-applications"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-xs transition hover:bg-white/20 hover:shadow-lg"
            >
              <FileCheck2 className="h-4 w-4 text-indigo-300" />
              My Applications
            </Link>
          </div>
        </div>

        {/* Search & Location Bar */}
        <div className="relative z-10 mt-8 grid gap-3 rounded-xl bg-white p-2.5 shadow-2xl md:grid-cols-[1fr_260px_auto]">
          <label className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitDrafts();
              }}
              className="h-11 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="Job title, keyword, skill, or employer..."
            />
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3.5">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={draftLocation}
              onChange={(event) => setDraftLocation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitDrafts();
              }}
              className="h-11 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="City, area, or remote..."
            />
          </label>

          <button
            onClick={commitDrafts}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <Search className="h-4 w-4" />
            {isFetching ? "Searching..." : "Search"}
          </button>
        </div>
      </section>

      {/* Filter Pills */}
      <ListingFilters
        selectedCategory={selectedCategory}
        onSelectCategory={selectCategory}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
      />

      {/* Error Notice */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : null}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-36 animate-pulse rounded-xl border border-slate-200 bg-slate-100 p-5"
            />
          ))}
        </div>
      ) : null}

      {/* Empty State */}
      {!isLoading && listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-16 text-center">
          <BriefcaseBusiness className="h-14 w-14 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No career listings found</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            We couldn&apos;t find any active job listings matching your search criteria. Try modifying
            your search keywords or location.
          </p>
          <button
            onClick={clearAllFilters}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Reset Filters
          </button>
        </div>
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
