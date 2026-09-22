"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCheck2,
  MapPin,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { fetchRentals } from "@/features/rentals/queries";
import { RentalCard, RentalFilters } from "@/features/rentals/view";

export default function RentalsBrowsePage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");
    setSelectedCategory("");
  };

  const {
    data: rentals = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["rentals", appliedQuery, appliedLocation, selectedCategory],
    queryFn: () =>
      fetchRentals({
        q: appliedQuery,
        location: appliedLocation,
        service: selectedCategory,
      }),
    staleTime: 30_000,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      {/* Hero / Header Section */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-6 text-warm-0 shadow-raised sm:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-navy-300/30 bg-navy-500/15 px-3 py-1 text-xs font-semibold text-navy-200">
              <Wrench className="size-3.5" />
              Verified Tools & Equipment Rentals
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-warm-0 sm:text-4xl lg:text-5xl">
              Rent Pro Tools & Gear
            </h1>
            <p className="text-sm text-warm-200 sm:text-base">
              Rent certified power tools, carpentry kits, and equipment with verified partners.
              100% refundable security deposit and transparent daily rates.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/rentals/mine"
              className="inline-flex items-center gap-2 rounded-control border border-warm-0/20 bg-warm-0/10 px-4 py-2.5 text-sm font-semibold text-warm-0 backdrop-blur-xs transition hover:bg-warm-0/20"
            >
              <FileCheck2 className="size-4 text-warm-100" />
              My Rentals
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
              placeholder="Search tools (e.g. Bosch Drill, Angle Grinder, Carpentry Kit)"
              className="w-full bg-transparent py-2.5 text-sm text-text placeholder:text-text-secondary/70 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-3 rounded-control border border-line bg-surface-sunken px-3.5 focus-within:border-line-strong">
            <MapPin className="size-4 shrink-0 text-text-secondary" />
            <input
              type="text"
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              placeholder="Location (e.g. Hyderabad)"
              className="w-full bg-transparent py-2.5 text-sm text-text placeholder:text-text-secondary/70 focus:outline-none"
            />
          </label>

          <Button type="submit" className="h-full px-6 font-bold">
            Search Gear
          </Button>
        </form>
      </section>

      {/* Filter Chips */}
      <RentalFilters
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        count={rentals.length}
      />

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rentals.map((asset) => (
            <RentalCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </main>
  );
}
