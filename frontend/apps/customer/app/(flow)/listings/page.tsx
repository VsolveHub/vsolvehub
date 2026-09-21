"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building,
  Clock,
  Coins,
  FileCheck2,
  Filter,
  Flame,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { fetchListings, listingFields } from "@/features/listings/queries";

const POPULAR_CATEGORIES = [
  { label: "All Roles", value: "" },
  { label: "IT & Software", value: "software" },
  { label: "Sales & Marketing", value: "sales" },
  { label: "Driver & Delivery", value: "driver" },
  { label: "Office & Admin", value: "admin" },
  { label: "Customer Support", value: "support" },
  { label: "Retail & Shop", value: "retail" },
];

export default function ListingsBrowsePage() {
  // Two pairs on purpose: the drafts are what the boxes show, the applied values
  // are what the request uses. Nothing reaches the server until Search, Enter or
  // a category pill commits them. Typing "software developer" used to be 18
  // requests; it is now zero.
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const commitDrafts = useCallback(() => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  }, [draftQuery, draftLocation]);

  // A pill is itself a search action, so it commits the boxes as well. Otherwise
  // tapping a category while text sat uncommitted would return results that
  // disagree with what the user can see typed in front of them.
  const selectCategory = (value: string) => {
    commitDrafts();
    setSelectedCategory(value);
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
        // The API filters on `service` directly. This is what the category used
        // to do by being concatenated onto the free-text query as one string.
        service: selectedCategory,
      }),
    staleTime: 30_000,
    // Hold the previous page on screen while the next one loads, matching
    // features/crew/queries.ts. Without it, committing a search blanks the list.
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      {/* Hero / Header Section */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 p-6 text-white shadow-xl sm:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 backdrop-blur">
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
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 hover:shadow-lg"
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
      <section className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
          <Filter className="h-3.5 w-3.5" /> Filter by:
        </span>
        {POPULAR_CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            onClick={() => selectCategory(cat.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              selectedCategory === cat.value
                ? "bg-slate-950 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {cat.label}
          </button>
        ))}
        {draftQuery || draftLocation || selectedCategory ? (
          <button
            onClick={() => {
              setDraftQuery("");
              setDraftLocation("");
              setAppliedQuery("");
              setAppliedLocation("");
              setSelectedCategory("");
            }}
            className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
          >
            Clear all filters
          </button>
        ) : null}
      </section>

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
            onClick={() => {
              setDraftQuery("");
              setDraftLocation("");
              setAppliedQuery("");
              setAppliedLocation("");
              setSelectedCategory("");
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Reset Filters
          </button>
        </div>
      ) : null}

      {/* Listings Grid */}
      <section className="grid gap-4">
        {listings.map((listing) => {
          const fields = listingFields(listing.structured_fields);
          const payRange = fields.pay_range || fields.salary_range || fields.compensation;
          const roleType = fields.role_type || fields.employment_type;
          const experience = fields.experience_years || fields.experience;
          const shift = fields.shift || fields.work_mode;

          return (
            <Link
              key={listing.id}
              href={`/listings/${listing.id}`}
              className={`group relative rounded-xl border p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                listing.is_premium
                  ? "border-amber-300/80 bg-gradient-to-r from-amber-50/40 via-white to-white"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {listing.is_premium && (
                <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                  Featured
                </div>
              )}

              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2.5 flex-1 pr-16">
                  {/* Employer and Location */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Building className="h-3.5 w-3.5 text-slate-400" />
                      {listing.poster_name || "Verified Employer"}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {listing.location_text || "Location on application"}
                    </span>
                    {listing.published_at && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          Posted {new Date(listing.published_at).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-bold tracking-tight text-slate-950 group-hover:text-indigo-600 transition">
                    {listing.title}
                  </h2>

                  {/* Description */}
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
                    {listing.description}
                  </p>

                  {/* Badges / Structured Fields */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {payRange ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        <Coins className="h-3.5 w-3.5 text-emerald-600" />
                        {String(payRange)}
                      </span>
                    ) : null}

                    {roleType ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        <BriefcaseBusiness className="h-3.5 w-3.5 text-slate-500" />
                        {String(roleType)}
                      </span>
                    ) : null}

                    {experience ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {String(experience)} Exp
                      </span>
                    ) : null}

                    {shift ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {String(shift)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Right side stats */}
                <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-100">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    {listing.application_count}{" "}
                    {listing.application_count === 1 ? "applicant" : "applicants"}
                  </span>
                  <span className="mt-auto hidden md:inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">
                    View & Apply &rarr;
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
