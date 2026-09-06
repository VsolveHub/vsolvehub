"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { fetchStayBrowse, type StayBrowseUnitCard } from "../queries";
import { StayPropertyGridCard } from "./stay-property-grid-card";

interface StayCatalogListingPaneProps {
  categorySlug: string;
  categoryName: string;
  activeTile: {
    slug: string;
    name: string;
    description: string;
    imageUrl?: string;
  };
}

const TRUST_BADGES = [
  { label: "Verified Properties", icon: ShieldCheck },
  { label: "On-time Service", icon: Clock },
  { label: "Transparent Pricing", icon: Tag },
  { label: "Secure & Safe", icon: Lock },
  { label: "Satisfaction Guarantee", icon: BadgeCheck },
];

const ITEMS_PER_PAGE = 6;

export function StayCatalogListingPane({
  categorySlug,
  categoryName,
  activeTile,
}: StayCatalogListingPaneProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Primary active filter pill
  const [activePill, setActivePill] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("relevant");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);

  // Date selection state
  const [startDate, setStartDate] = useState<string>(searchParams.get("start_date") || "");
  const [endDate, setEndDate] = useState<string>(searchParams.get("end_date") || "");

  // Advanced drawer filter state
  const [drawerLocality, setDrawerLocality] = useState<string>(searchParams.get("locality") || "");
  const [drawerMaxPrice, setDrawerMaxPrice] = useState<number>(100000);
  const [drawerSharing, setDrawerSharing] = useState<string>("");

  // Data state
  const [units, setUnits] = useState<StayBrowseUnitCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Reset all filters and clear query parameters from browser address bar
  const handleResetAllFilters = () => {
    setActivePill("all");
    setDrawerLocality("");
    setDrawerMaxPrice(100000);
    setDrawerSharing("");
    setStartDate("");
    setEndDate("");
    setSortBy("relevant");
    setCurrentPage(1);
    setFilterDrawerOpen(false);
    router.replace(pathname, { scroll: false });
  };

  // Reset page when tile changes
  useEffect(() => {
    setCurrentPage(1);
    setActivePill("all");
  }, [activeTile.slug]);

  // Fetch stay units from backend
  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError(null);

    // Derive query params based on active filter pill
    const isAc = activePill === "ac" ? true : activePill === "non_ac" ? false : undefined;
    const foodIncluded = activePill === "food" ? true : undefined;
    const sharingType = activePill === "1_sharing"
      ? "PRIVATE"
      : activePill === "2_sharing"
      ? "DOUBLE"
      : drawerSharing || undefined;
    const furnishingStatus = activePill === "furnished" ? "FULLY_FURNISHED" : undefined;

    fetchStayBrowse({
      subcategory: activeTile.slug,
      is_ac: isAc,
      food_included: foodIncluded,
      sharing_type: sharingType,
      furnishing_status: furnishingStatus,
      locality: drawerLocality || undefined,
      max_price: drawerMaxPrice < 100000 ? drawerMaxPrice * 100 : undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    })
      .then((data) => {
        if (isCurrent) {
          setUnits(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : "Failed to load properties.");
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeTile.slug, activePill, drawerLocality, drawerMaxPrice, drawerSharing, startDate, endDate]);

  // Filter client-side pills (e.g. attached bathroom, near metro) & sort
  const filteredAndSorted = useMemo(() => {
    let list = [...units];

    if (activePill === "attached_bath") {
      list = list.filter((u) => u.bathroom_type === "ATTACHED" || u.unit_name.toLowerCase().includes("attached"));
    } else if (activePill === "metro") {
      list = list.filter(
        (u) =>
          u.locality.toLowerCase().includes("metro") ||
          u.amenities?.some((a) => a.toLowerCase().includes("metro")) ||
          u.property_title.toLowerCase().includes("metro"),
      );
    }

    // Sorting
    if (sortBy === "price_asc") {
      list.sort((a, b) => a.price_per_month - b.price_per_month);
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => b.price_per_month - a.price_per_month);
    } else if (sortBy === "rating") {
      list.sort((a, b) => b.rating - a.rating);
    }

    return list;
  }, [units, activePill, sortBy]);

  // Pagination
  const totalItems = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const displayedUnits = filteredAndSorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const filterPills = [
    { id: "all", label: `All ${activeTile.name}` },
    { id: "ac", label: "AC" },
    { id: "non_ac", label: "Non-AC" },
    { id: "1_sharing", label: "1 Sharing" },
    { id: "2_sharing", label: "2 Sharing" },
    { id: "attached_bath", label: "Attached Bathroom" },
    { id: "furnished", label: "Furnished" },
    { id: "food", label: "With Food" },
    { id: "metro", label: "Near Metro" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Scrollable Container */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 py-5">
        {/* 1. Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-3">
          <Link href="/" className="hover:text-navy-900 transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 text-gray-400" />
          <Link href={`/catalog/${categorySlug}`} className="hover:text-navy-900 transition-colors">
            {categoryName}
          </Link>
          <ChevronRight className="h-3 w-3 text-gray-400" />
          <span className="text-navy-900 font-semibold">{activeTile.name}</span>
        </nav>

        {/* 2. Top Header Row: Title & Description on Left, Banner on Right */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-4">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-navy-900 leading-tight">
              {activeTile.name}
            </h1>
            <p className="mt-1 text-[13px] sm:text-sm text-text-secondary leading-relaxed font-medium">
              {activeTile.description.trim() ||
                `Comfortable private and shared ${activeTile.name.toLowerCase()} with flexible stays.`}
            </p>

            {/* Trust Badges */}
            <ul className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 list-none p-0">
              {TRUST_BADGES.map((b) => (
                <li key={b.label} className="flex items-center gap-1.5 text-[11px] font-semibold text-navy-800">
                  <b.icon className="size-3.5 text-[#1e50b3]" strokeWidth={2} />
                  <span>{b.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Promotional Banner Card */}
          <div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-navy-900 to-indigo-900 p-4 text-white shadow-sm w-full lg:w-72 h-24 flex items-center justify-between">
            <div className="relative z-10 min-w-0 pr-3">
              <p className="text-xs font-black tracking-wide leading-snug">
                Find your perfect stay
              </p>
              <p className="mt-1 text-[10px] text-gray-300 font-medium">
                Safe. Affordable. Comfortable.
              </p>
            </div>
            <img
              src="https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=300&auto=format&fit=crop&q=80"
              alt=""
              className="absolute inset-y-0 right-0 w-28 h-full object-cover opacity-60 mix-blend-luminosity"
            />
          </div>
        </div>

        {/* 3. Filter Pills Row */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-b border-gray-100 py-3.5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth pb-0.5">
            {filterPills.map((pill) => {
              const isActive = activePill === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setActivePill(pill.id);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-navy-900 text-white font-bold shadow-xs"
                      : "bg-white border border-gray-200/90 text-gray-700 hover:border-gray-300 font-medium hover:bg-gray-50"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Filters Button */}
          <button
            type="button"
            onClick={() => setFilterDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-navy-900 hover:bg-gray-50 transition-colors shrink-0 shadow-2xs cursor-pointer"
          >
            <SlidersHorizontal className="size-3.5 text-navy-900" />
            <span>Filters</span>
          </button>
        </div>

        {/* Date Selection Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50/40 border border-orange-100 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 font-bold text-navy-900">
              <Calendar className="size-4 text-[#f87000]" />
              <span>Stay Dates:</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-gray-600 font-medium">
                Check-in:
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                />
              </label>

              <span className="text-gray-400">→</span>

              <label className="flex items-center gap-1 text-[11px] text-gray-600 font-medium">
                Check-out:
                <input
                  type="date"
                  min={startDate || new Date().toISOString().slice(0, 10)}
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                />
              </label>
            </div>

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setCurrentPage(1);
                }}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 underline cursor-pointer ml-1"
              >
                Clear Dates
              </button>
            )}
          </div>

          {(activePill !== "all" || drawerLocality || drawerMaxPrice < 100000 || drawerSharing || startDate || endDate) && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#b84814] hover:text-[#f87000] cursor-pointer"
            >
              <RotateCcw className="size-3" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        {/* 4. Results Count & Sort Dropdown */}
        <div className="mt-4 mb-5 flex items-center justify-between text-xs text-gray-500 font-medium">
          <p>
            Showing <strong className="text-navy-900 font-bold">{totalItems}</strong>{" "}
            {totalItems === 1 ? "property" : "properties"} in Hyderabad
          </p>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900 cursor-pointer"
            >
              <option value="relevant">Most Relevant</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>
        </div>

        {/* 5. Main Property Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-80 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs animate-pulse flex flex-col justify-between"
              >
                <div className="aspect-[16/10] w-full bg-gray-200 rounded-xl" />
                <div className="space-y-2 mt-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="h-10 bg-gray-100 rounded-xl mt-4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700">
            <p className="font-bold">{error}</p>
            <button
              onClick={() => setActivePill("all")}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700"
            >
              Reset Filters
            </button>
          </div>
        ) : displayedUnits.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
            <h3 className="text-base font-extrabold text-navy-900">
              No matching properties found in {activeTile.name}
            </h3>
            <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
              Try switching your filter pill or clearing price restrictions to see all available properties.
            </p>
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#f87000] px-4 py-2 text-xs font-bold text-white hover:bg-[#e06500] transition-colors"
            >
              <RotateCcw className="size-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {displayedUnits.map((card) => (
              <StayPropertyGridCard
                key={card.unit_type_id}
                card={card}
                activeTileSlug={activeTile.slug}
              />
            ))}
          </div>
        )}

        {/* 6. Pagination Bar */}
        {totalPages > 1 && (
          <div className="mt-8 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-5 text-xs text-gray-500 font-medium">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="size-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>

              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                const isCurrent = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`size-8 rounded-lg font-bold text-xs transition-colors ${
                      isCurrent
                        ? "bg-[#f87000] text-white shadow-xs"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="size-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <p>
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
              {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} properties
            </p>
          </div>
        )}
      </div>

      {/* Filter Drawer / Modal */}
      {filterDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-2xs">
          <div className="h-full w-full max-w-sm bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-[#f87000]" />
                  <h3 className="text-base font-black text-navy-900">Filter Properties</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterDrawerOpen(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Locality Search */}
              <div className="mt-5">
                <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Locality in Hyderabad
                </label>
                <input
                  type="text"
                  value={drawerLocality}
                  onChange={(e) => setDrawerLocality(e.target.value)}
                  placeholder="e.g. Madhapur, Ameerpet, Gachibowli..."
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                />
              </div>

              {/* Sharing Type */}
              <div className="mt-5">
                <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Sharing Option
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { label: "All Sharing", value: "" },
                    { label: "Private Single", value: "PRIVATE" },
                    { label: "Double (2)", value: "DOUBLE" },
                    { label: "Triple (3)", value: "TRIPLE" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDrawerSharing(opt.value)}
                      className={`rounded-xl py-2 px-3 text-xs font-bold border transition-colors ${
                        drawerSharing === opt.value
                          ? "bg-orange-50 border-[#f87000] text-[#b84814]"
                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Budget Slider */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-navy-900 uppercase tracking-wider">Max Monthly Rent</span>
                  <span className="font-black text-[#f87000]">
                    {drawerMaxPrice >= 100000 ? "Any Budget" : `₹${drawerMaxPrice.toLocaleString("en-IN")}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={5000}
                  max={100000}
                  step={2000}
                  value={drawerMaxPrice}
                  onChange={(e) => setDrawerMaxPrice(Number(e.target.value))}
                  className="mt-3 w-full accent-[#f87000]"
                />
              </div>

              {/* Check-In / Check-Out Dates */}
              <div className="mt-5">
                <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Check-in / Check-out Dates
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-gray-500 font-medium">Move-in</span>
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 p-2 text-xs text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-medium">Move-out</span>
                    <input
                      type="date"
                      min={startDate || new Date().toISOString().slice(0, 10)}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 p-2 text-xs text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-navy-900 hover:bg-gray-50 transition-colors"
              >
                Reset All
              </button>
              <button
                type="button"
                onClick={() => setFilterDrawerOpen(false)}
                className="flex-1 rounded-xl bg-[#f87000] py-2.5 text-xs font-bold text-white hover:bg-[#e06500] transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
