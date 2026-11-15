"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useBrowseList } from "@vsolve/query";
import {
  ArrowLeft,
  Check,
  FileCheck2,
  Heart,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import { EmptyState, ErrorState, LoadMore, Skeleton } from "@vsolve/ui";

import { useSavedItems } from "@/features/part-a";
import {
  fetchListing,
  fetchListings,
  fetchMyApplicationsPage,
  type Listing,
} from "@/features/listings/queries";
import { ListingOpportunityCard } from "@/features/listings/listing-opportunity-card";
import {
  CATEGORY_TONE_CONFIGS,
  JobApplyDrawer,
  JobsForYou,
  ListingSidebarFilters,
  resolveCategoryTone,
} from "@/features/listings/view";
import { useCustomerSession } from "@/features/session/queries";

const CITIES = [
  "Hyderabad",
  "Secunderabad",
  "Warangal",
  "Karimnagar",
  "Nizamabad",
  "Khammam",
  "Mahbubnagar",
  "Nalgonda",
  "Siddipet",
  "Suryapet",
  "Adilabad",
  "Mancherial",
  "Ramagundam",
  "Sangareddy",
];

/** Dedicated search bar with isolated input state to prevent typing lag */
function HeroSearchBar({
  initialQuery = "",
  initialLocation = "",
  onSearch,
  isFetching = false,
}: {
  initialQuery?: string;
  initialLocation?: string;
  onSearch: (q: string, loc: string) => void;
  isFetching?: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [loc, setLoc] = useState(initialLocation);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(q.trim(), loc.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 grid grid-cols-1 md:grid-cols-[1.4fr_1fr_auto] gap-2 rounded-2xl border border-[#E8E3DE] bg-[#FAF9F7] p-2"
    >
      <label className="flex items-center gap-2.5 rounded-xl border border-[#E8E3DE] bg-white px-3.5 min-h-[46px] focus-within:border-[#15264D] focus-within:ring-2 focus-within:ring-[#15264D]/10 transition">
        <Search className="size-4 text-[#5F6B7E] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Job title or skill — Tally, Nurse, Full Stack"
          className="w-full bg-transparent text-sm font-semibold text-[#15264D] placeholder-[#5F6B7E] outline-none"
        />
      </label>

      <label className="flex items-center gap-2.5 rounded-xl border border-[#E8E3DE] bg-white px-3.5 min-h-[46px] focus-within:border-[#15264D] focus-within:ring-2 focus-within:ring-[#15264D]/10 transition">
        <MapPin className="size-4 text-[#5F6B7E] shrink-0" />
        <input
          list="telangana-cities"
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          placeholder="City or district — Hyderabad, Suryapet..."
          className="w-full bg-transparent text-sm font-semibold text-[#15264D] placeholder-[#5F6B7E] outline-none"
        />
        <datalist id="telangana-cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <button
        type="submit"
        className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-xl bg-[#FF7900] hover:bg-[#ff8a1f] active:bg-[#e66d00] text-sm font-extrabold text-[#15264D] shadow-xs transition"
      >
        {isFetching ? "Searching…" : "Search jobs"}
      </button>
    </form>
  );
}

function ListingsBrowseContent() {
  const session = useCustomerSession();
  const searchParams = useSearchParams();
  const saved = useSavedItems("listing");

  const initService = searchParams.get("service") ?? "";
  const initialApplySlug = searchParams.get("apply") ?? "";

  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initService);

  // Filter state sets
  const [workModes, setWorkModes] = useState<string[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [minSalary, setMinSalary] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState("latest");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Drawer state
  const [drawerListing, setDrawerListing] = useState<Listing | null>(null);
  const initialSlugCheckedRef = useRef(false);

  // Toggle filter handlers
  const handleToggleWorkMode = useCallback((mode: string) => {
    setWorkModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  }, []);

  const handleToggleEmploymentType = useCallback((type: string) => {
    setEmploymentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const handleSearchCommit = useCallback((q: string, loc: string) => {
    setAppliedQuery(q);
    setAppliedLocation(loc);
  }, []);

  const handleSelectCategory = useCallback((value: string) => {
    setSelectedCategory(value);
  }, []);

  const clearAllFilters = useCallback(() => {
    setAppliedQuery("");
    setAppliedLocation("");
    setSelectedCategory("");
    setWorkModes([]);
    setEmploymentTypes([]);
    setMinSalary(undefined);
    setSort("latest");
  }, []);

  const hasActiveFilters = Boolean(
    appliedQuery ||
      appliedLocation ||
      selectedCategory ||
      workModes.length > 0 ||
      employmentTypes.length > 0 ||
      minSalary !== undefined,
  );

  // Mapped string parameters for API query
  const mappedWorkMode = useMemo(() => {
    if (workModes.includes("onsite")) return "ON_SITE";
    if (workModes.includes("hybrid")) return "HYBRID";
    if (workModes.includes("remote")) return "REMOTE";
    return "";
  }, [workModes]);

  const mappedEmploymentType = useMemo(() => {
    if (employmentTypes.includes("full")) return "FULL_TIME";
    if (employmentTypes.includes("part")) return "PART_TIME";
    if (employmentTypes.includes("shift")) return "CONTRACT";
    return "";
  }, [employmentTypes]);

  // Browse list query - fetches jobs matching search query, location, employment type, work mode, salary, and sort
  const {
    items: rawListings,
    isLoading,
    isFetching,
    error,
    hasMore,
    loadMore,
    loadingMore,
  } = useBrowseList(
    [
      "listings",
      appliedQuery,
      appliedLocation,
      mappedEmploymentType,
      mappedWorkMode,
      minSalary,
      sort,
    ],
    (offset, limit) =>
      fetchListings({
        q: appliedQuery,
        location: appliedLocation,
        sort,
        employment_type: mappedEmploymentType,
        work_mode: mappedWorkMode,
        min_salary: minSalary,
        limit,
        offset,
      }),
  );

  // Applications query to track applied jobs
  const myApplicationsQuery = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: () => fetchMyApplicationsPage(undefined),
    enabled: session.isAuthenticated,
    staleTime: 60_000,
  });

  const appliedListingIds = useMemo(() => {
    const list = (myApplicationsQuery.data?.results ?? []) as Array<{ listing?: string }>;
    return new Set(list.map((r) => r.listing).filter((id): id is string => Boolean(id)));
  }, [myApplicationsQuery.data]);

  const applicationsCount = myApplicationsQuery.data?.results?.length ?? 0;
  const savedCount = saved.ids?.length ?? 0;

  // Compute persistent category facet counts from loaded items for sidebar
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const listing of rawListings) {
      const tone = resolveCategoryTone(listing.job_category, listing.title);
      counts[tone.key] = (counts[tone.key] || 0) + 1;
    }
    return counts;
  }, [rawListings]);

  // Client-side category filtering against selected category
  const filteredListings = useMemo(() => {
    if (!selectedCategory || selectedCategory === "all") {
      return rawListings;
    }
    return rawListings.filter((listing) => {
      const tone = resolveCategoryTone(listing.job_category, listing.title);
      return tone.key === selectedCategory;
    });
  }, [rawListings, selectedCategory]);

  // Deep-linking: auto-open drawer if ?apply=slug is present on load
  useEffect(() => {
    if (initialApplySlug && !initialSlugCheckedRef.current) {
      initialSlugCheckedRef.current = true;
      fetchListing(initialApplySlug)
        .then((l) => setDrawerListing(l as unknown as Listing))
        .catch(() => {});
    }
  }, [initialApplySlug]);

  // Handle drawer open with URL update
  const handleOpenDrawer = useCallback((listing: Listing) => {
    setDrawerListing(listing);
    const url = new URL(window.location.href);
    url.searchParams.set("apply", listing.slug);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerListing(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("apply");
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6 px-4 pt-3 pb-12 sm:py-6">
      {/* Top Bar: Back to Home + Saved / My Applications counters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[#46536A] hover:text-[#15264D] transition"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Home</span>
        </Link>

        <div className="flex items-center gap-2">
          {session.isAuthenticated ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#E8E3DE] bg-white px-3.5 py-1.5 text-xs font-bold text-[#15264D] hover:bg-[#FAF9F7] transition"
              >
                <Heart className="size-3.5 text-rose-500 fill-rose-500" />
                <span>Saved ({savedCount})</span>
              </button>

              <Link
                href="/listings/my-applications"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#E8E3DE] bg-white px-3.5 py-1.5 text-xs font-bold text-[#15264D] hover:bg-[#FAF9F7] transition"
              >
                <FileCheck2 className="size-3.5 text-[#047857]" />
                <span>My Applications ({applicationsCount})</span>
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Hero Card */}
      <section className="rounded-[20px] border border-[#E8E3DE] bg-[#FFFFFF] p-6 sm:p-8 shadow-[0_1px_2px_rgba(21,38,77,.05),0_4px_14px_rgba(21,38,77,.05)]">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#15264D] tracking-tight leading-tight">
          Find verified jobs across Telangana &amp; Andhra Pradesh
        </h1>
        <p className="mt-1.5 text-sm sm:text-base text-[#46536A] max-w-2xl">
          Apply directly to verified local businesses, clinics, shops and tech teams.
        </p>

        {/* 2-Field Integrated Search Bar */}
        <HeroSearchBar
          initialQuery={appliedQuery}
          initialLocation={appliedLocation}
          onSearch={handleSearchCommit}
          isFetching={isFetching}
        />

        {/* Trust verification strip */}
        <div className="mt-4 pt-3.5 border-t border-[#E8E3DE] flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-[#46536A]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-[#047857]" />
            Every employer phone &amp; GST verified
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4 text-[#047857]" />
            Apply direct — employer calls you
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4 text-[#047857]" />
            Free for candidates, always
          </span>
        </div>
      </section>

      {/* Jobs For You personalized section for authenticated users */}
      {session.isAuthenticated ? <JobsForYou /> : null}

      {/* Split-Browse Grid Layout (Left: Sidebar, Right: Feed) */}
      <div className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)] gap-6 items-start">
        {/* Left Sidebar */}
        <ListingSidebarFilters
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          workModes={workModes}
          onToggleWorkMode={handleToggleWorkMode}
          employmentTypes={employmentTypes}
          onToggleEmploymentType={handleToggleEmploymentType}
          minSalary={minSalary}
          onSelectMinSalary={setMinSalary}
          categoryCounts={categoryCounts}
          totalCount={rawListings.length}
          onResetAll={clearAllFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Right Column: Feed & Controls */}
        <div className="min-w-0">
          {/* Feed Toolbar: Live Count + Density Toggle + Sort Selector */}
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#15264D]">
              Showing <span className="text-[#B54700]">{filteredListings.length}</span>{" "}
              {filteredListings.length === 1 ? "job" : "jobs"}
              {selectedCategory && CATEGORY_TONE_CONFIGS[selectedCategory]
                ? ` in ${CATEGORY_TONE_CONFIGS[selectedCategory].label}`
                : ""}
              {appliedLocation ? ` around ${appliedLocation}` : ""}
            </p>

            <div className="flex items-center gap-3">
              {/* Density Segment Toggle */}
              <div
                className="hidden sm:inline-flex rounded-xl border border-[#E8E3DE] bg-white p-0.5"
                role="group"
                aria-label="Card density"
              >
                <button
                  type="button"
                  onClick={() => setDensity("comfortable")}
                  aria-pressed={density === "comfortable"}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    density === "comfortable"
                      ? "bg-[#15264D] text-white"
                      : "text-[#5F6B7E] hover:text-[#15264D]"
                  }`}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  onClick={() => setDensity("compact")}
                  aria-pressed={density === "compact"}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    density === "compact"
                      ? "bg-[#15264D] text-white"
                      : "text-[#5F6B7E] hover:text-[#15264D]"
                  }`}
                >
                  Compact
                </button>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#46536A]">
                <label htmlFor="sort-dropdown">Sort by</label>
                <select
                  id="sort-dropdown"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-xl border border-[#E8E3DE] bg-white px-2.5 py-1.5 text-xs font-bold text-[#15264D] outline-none"
                >
                  <option value="latest">Latest posted</option>
                  <option value="pay">Pay: high to low</option>
                  <option value="relevant">Most relevant</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Notice */}
          {error ? (
            <ErrorState
              title="Could not load job listings"
              message={(error as Error).message || "An unexpected error occurred while fetching listings."}
            />
          ) : null}

          {/* Loading Skeleton */}
          {isLoading ? (
            <div className="grid gap-3.5">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-32 rounded-2xl border border-[#E8E3DE]" />
              ))}
            </div>
          ) : null}

          {/* Empty State */}
          {!isLoading && filteredListings.length === 0 ? (
            <EmptyState
              title={
                selectedCategory && CATEGORY_TONE_CONFIGS[selectedCategory]
                  ? `No jobs found in ${CATEGORY_TONE_CONFIGS[selectedCategory].label}`
                  : "No career listings match these filters"
              }
              description="Try adjusting your keywords, selecting a different city, or resetting the filters."
              action={
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#15264D] text-xs font-bold text-white hover:bg-[#00112e] transition"
                >
                  Reset all filters
                </button>
              }
            />
          ) : null}

          {/* Opportunity Cards List: Whole card clickable, View details removed */}
          <section className="grid gap-3.5">
            {filteredListings.map((listing: Listing) => (
              <ListingOpportunityCard
                key={listing.id}
                listing={listing}
                density={density}
                isApplied={appliedListingIds.has(listing.id)}
                onApply={handleOpenDrawer}
              />
            ))}
          </section>

          {/* Pagination / Load More */}
          <div className="mt-4">
            <LoadMore
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={loadMore}
              label="Show more jobs"
            />
          </div>
        </div>
      </div>

      {/* Right-Side Slide-Over Apply & Detail Drawer */}
      <JobApplyDrawer
        listing={drawerListing}
        isOpen={Boolean(drawerListing)}
        onClose={handleCloseDrawer}
        appliedListingIds={appliedListingIds}
      />
    </main>
  );
}

export default function ListingsBrowsePage() {
  return (
    <Suspense fallback={null}>
      <ListingsBrowseContent />
    </Suspense>
  );
}
