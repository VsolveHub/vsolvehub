"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  BedDouble,
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
  Zap,
} from "lucide-react";
import {
  fetchStayBrowse,
  fetchStayFilterDefinitions,
  type StayBrowseUnitCard,
  type StayFilterDefinition,
} from "../queries";
import { StayPropertyGridCard } from "./stay-property-grid-card";
import {
  defaultStayEndDate,
  defaultStayStartDate,
  hideSoldOutStayCards,
} from "../stay-checkout-rules";

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
  { label: "Verified Properties", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { label: "On-time Service", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-100" },
  { label: "Transparent Pricing", icon: Tag, color: "text-amber-600 bg-amber-50 border-amber-100" },
  { label: "Secure & Safe", icon: Lock, color: "text-purple-600 bg-purple-50 border-purple-100" },
  { label: "Satisfaction Guarantee", icon: BadgeCheck, color: "text-rose-600 bg-rose-50 border-rose-100" },
];

const ITEMS_PER_PAGE = 9;

// ─── Styled date dropdowns ────────────────────────────────────────────────────

const MONTHS = [
  { short: "Jan", num: 1 }, { short: "Feb", num: 2 }, { short: "Mar", num: 3 },
  { short: "Apr", num: 4 }, { short: "May", num: 5 }, { short: "Jun", num: 6 },
  { short: "Jul", num: 7 }, { short: "Aug", num: 8 }, { short: "Sep", num: 9 },
  { short: "Oct", num: 10 }, { short: "Nov", num: 11 }, { short: "Dec", num: 12 },
];

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function isoToDateParts(iso: string): { day: number; month: number; year: number } | null {
  if (!iso) return null;
  const [yStr, mStr, dStr] = iso.split("-");
  const y = parseInt(yStr, 10), m = parseInt(mStr, 10), d = parseInt(dStr, 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { day: d, month: m, year: y };
}

function datePartsToIso(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function StyledDateSelect({
  label,
  value,
  onChange,
  min,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  disabled?: boolean;
}) {
  const parts = isoToDateParts(value);
  const minParts = min ? isoToDateParts(min) : null;
  const today = new Date();
  const currentYear = today.getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear + i);

  const day = parts?.day ?? today.getDate();
  const month = parts?.month ?? today.getMonth() + 1;
  const year = parts?.year ?? currentYear;
  const maxDay = daysInMonth(month, year);

  const update = (d: number, m: number, y: number) => {
    const clamped = Math.min(d, daysInMonth(m, y));
    onChange(datePartsToIso(clamped, m, y));
  };

  const selectClass = "appearance-none bg-transparent text-[11px] font-bold text-navy-900 focus:outline-none cursor-pointer";

  return (
    <div className={`flex flex-col gap-0.5 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-2xs">
        <select
          value={month}
          onChange={(e) => update(day, parseInt(e.target.value, 10), year)}
          className={selectClass}
          aria-label={`${label} month`}
        >
          {MONTHS.map(({ short, num }) => {
            const isDisabled = minParts
              ? year < minParts.year || (year === minParts.year && num < minParts.month)
              : false;
            return <option key={num} value={num} disabled={isDisabled}>{short}</option>;
          })}
        </select>
        <span className="text-gray-300 font-medium text-[11px]">/</span>
        <select
          value={day}
          onChange={(e) => update(parseInt(e.target.value, 10), month, year)}
          className={selectClass}
          aria-label={`${label} day`}
        >
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => {
            const isDisabled = minParts
              ? year < minParts.year ||
                (year === minParts.year && month < minParts.month) ||
                (year === minParts.year && month === minParts.month && d < minParts.day)
              : false;
            return <option key={d} value={d} disabled={isDisabled}>{String(d).padStart(2, "0")}</option>;
          })}
        </select>
        <span className="text-gray-300 font-medium text-[11px]">/</span>
        <select
          value={year}
          onChange={(e) => update(day, month, parseInt(e.target.value, 10))}
          className={selectClass}
          aria-label={`${label} year`}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Calendar className="ml-1 size-3 text-gray-400 shrink-0 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Night/month duration summary pill ───────────────────────────────────────

function DateRangeSummary({ startDate, endDate, isHotelTile }: { startDate: string; endDate: string; isHotelTile: boolean }) {
  if (!startDate || !endDate) return null;
  const diffMs = new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime();
  if (diffMs <= 0) return null;
  const nights = Math.round(diffMs / 86_400_000);
  if (isHotelTile) {
    return <span className="rounded-full bg-navy-900 px-3 py-0.5 text-[11px] font-bold text-white">{nights} night{nights !== 1 ? "s" : ""}</span>;
  }
  const months = Math.round(nights / 30);
  return (
    <span className="rounded-full bg-navy-900 px-3 py-0.5 text-[11px] font-bold text-white">
      {months >= 1 ? `~${months} month${months !== 1 ? "s" : ""}` : `${nights} day${nights !== 1 ? "s" : ""}`}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [startDate, setStartDate] = useState<string>(
    searchParams.get("start_date") || defaultStayStartDate(),
  );
  const [endDate, setEndDate] = useState<string>(
    searchParams.get("end_date") || defaultStayEndDate(),
  );

  // Advanced drawer filter state
  const [drawerLocality, setDrawerLocality] = useState<string>(searchParams.get("locality") || "");
  const [drawerMaxPrice, setDrawerMaxPrice] = useState<number>(100000);
  const [drawerSharing, setDrawerSharing] = useState<string>("");
  const [drawerRoomClass, setDrawerRoomClass] = useState<string>("");
  const [drawerMinCapacity, setDrawerMinCapacity] = useState<number>(0);

  // Backend-driven filter set (plan Django_Next.js_Plan/M3/05-a9-stay-property-type-remediation.md
  // SS5 Wave 2 item 5): replaces the old hardcoded pill/drawer lists, which offered "1 Sharing" /
  // "2 Sharing" on every subcategory including whole-unit ones (villas, apartments) where sharing
  // doesn't apply. get_stay_filter_definitions(service_slug=...) already returns the right shape
  // per-subcategory because seed_stay_catalog.py only seeds sharing_type/food_included ServiceQuestions
  // for SHARED subcategories and occupancy_capacity for ENTIRE_UNIT ones.
  const [filterDefinitions, setFilterDefinitions] = useState<StayFilterDefinition[]>([]);

  // Data state
  const [units, setUnits] = useState<StayBrowseUnitCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pill container ref (for overflow fade)
  const pillsRef = useRef<HTMLDivElement>(null);

  // Reset all filters and clear query parameters from browser address bar
  const handleResetAllFilters = () => {
    setActivePill("all");
    setDrawerLocality("");
    setDrawerMaxPrice(100000);
    setDrawerSharing("");
    setDrawerRoomClass("");
    setDrawerMinCapacity(0);
    setStartDate(defaultStayStartDate());
    setEndDate(defaultStayEndDate({ hotel: isHotelTile }));
    setSortBy("relevant");
    setCurrentPage(1);
    setFilterDrawerOpen(false);
    router.replace(pathname, { scroll: false });
  };

  // Reset page when tile changes
  useEffect(() => {
    setCurrentPage(1);
    setActivePill("all");
    setDrawerSharing("");
    setDrawerRoomClass("");
    setDrawerMinCapacity(0);
  }, [activeTile.slug]);

  // Fetch the backend-driven filter set for this subcategory/service.
  useEffect(() => {
    let isCurrent = true;
    fetchStayFilterDefinitions(activeTile.slug)
      .then((defs) => {
        if (isCurrent) setFilterDefinitions(defs);
      })
      .catch(() => {
        if (isCurrent) setFilterDefinitions([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [activeTile.slug]);

  const sharingFilterDef = filterDefinitions.find((d) => d.code === "sharing_type");
  const capacityFilterDef = filterDefinitions.find((d) => d.code === "occupancy_capacity");
  const roomClassFilterDef = filterDefinitions.find((d) => d.code === "room_class");
  const foodFilterDef = filterDefinitions.find((d) => d.code === "food_included");
  const isHotelTile = Boolean(roomClassFilterDef);
  const isSharedTile = Boolean(sharingFilterDef);
  const isEntireUnitTile = Boolean(capacityFilterDef) && !sharingFilterDef && !isHotelTile;
  const usesCapacityFilter = Boolean(capacityFilterDef) && !sharingFilterDef;

  const endDateFromQuery = searchParams.get("end_date");
  useEffect(() => {
    if (endDateFromQuery) return;
    setEndDate((current) => {
      const hotelEnd = defaultStayEndDate({ hotel: true });
      const monthlyEnd = defaultStayEndDate();
      if (isHotelTile) return hotelEnd;
      if (current === hotelEnd || current === monthlyEnd || !current) return monthlyEnd;
      return current;
    });
  }, [isHotelTile, endDateFromQuery]);

  // Fetch stay units from backend
  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError(null);

    // Derive query params based on active filter pill. Sharing-based pills only apply
    // when this subcategory is actually a shared-occupancy one (isSharedTile) -- on an
    // entire-unit tile (villas, apartments) they simply don't render (see filterPills
    // below), so activePill can never carry a sharing value there.
    const isAc = activePill === "ac" ? true : activePill === "non_ac" ? false : undefined;
    const foodIncluded = activePill === "food" ? true : undefined;
    const sharingType = isSharedTile
      ? activePill === "1_sharing"
        ? "PRIVATE"
        : activePill === "2_sharing"
        ? "DOUBLE"
        : drawerSharing || undefined
      : undefined;
    const occupancyCapacityGte = usesCapacityFilter && drawerMinCapacity > 0 ? drawerMinCapacity : undefined;
    const furnishingStatus = activePill === "furnished" ? "FULLY_FURNISHED" : undefined;
    const roomClass = isHotelTile
      ? activePill.startsWith("roomclass_")
        ? activePill.slice("roomclass_".length)
        : drawerRoomClass || undefined
      : undefined;

    fetchStayBrowse({
      subcategory: activeTile.slug,
      is_ac: isAc,
      food_included: foodIncluded,
      sharing_type: sharingType,
      occupancy_capacity_gte: occupancyCapacityGte,
      room_class: roomClass,
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
  }, [
    activeTile.slug,
    activePill,
    drawerLocality,
    drawerMaxPrice,
    drawerSharing,
    drawerRoomClass,
    drawerMinCapacity,
    isSharedTile,
    isEntireUnitTile,
    isHotelTile,
    usesCapacityFilter,
    startDate,
    endDate,
  ]);

  // Filter client-side pills (e.g. attached bathroom, near metro) & sort
  const filteredAndSorted = useMemo(() => {
    let list = hideSoldOutStayCards(units, Boolean(startDate && endDate));

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
  }, [units, activePill, sortBy, startDate, endDate]);

  // Pagination
  const totalItems = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const displayedUnits = filteredAndSorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // Sharing pills only make sense for shared-occupancy subcategories (PG/Hostel/Co-Living);
  // showing "1 Sharing" / "2 Sharing" on a villa or apartment tile was exactly the bug this
  // remediation fixes. Food pill likewise only applies where food_included is a real,
  // seeded concept for this tile (see foodFilterDef above).
  const filterPills = [
    { id: "all", label: `All ${activeTile.name}` },
    { id: "ac", label: "AC" },
    { id: "non_ac", label: "Non-AC" },
    ...(isSharedTile ? [
      { id: "1_sharing", label: "1 Sharing" },
      { id: "2_sharing", label: "2 Sharing" },
    ] : []),
    ...(isHotelTile && roomClassFilterDef
      ? roomClassFilterDef.options.map((o) => ({
          id: `roomclass_${o.code}`,
          label: o.label,
        }))
      : []),
    { id: "attached_bath", label: "Attached Bathroom" },
    { id: "furnished", label: "Furnished" },
    ...(foodFilterDef ? [{ id: "food", label: "With Food" }] : []),
    { id: "metro", label: "Near Metro" },
  ];

  // Dynamic result scope label
  const localityScope = drawerLocality ? `in ${drawerLocality}` : activePill !== "all" ? "matching your filters" : null;

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

            {/* Trust Badges — pill style with colored icon */}
            <ul className="mt-3.5 flex flex-wrap items-center gap-2 list-none p-0">
              {TRUST_BADGES.map((b) => (
                <li
                  key={b.label}
                  className="flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3 py-1 text-[11px] font-semibold text-navy-800 shadow-2xs"
                >
                  <span className={`flex items-center justify-center rounded-full w-4 h-4 border ${b.color}`}>
                    <b.icon className="size-2.5" strokeWidth={2.5} />
                  </span>
                  <span>{b.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Promotional Banner Card — pure CSS gradient, no external image */}
          <div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-indigo-900 to-purple-900 p-5 text-white shadow-md w-full lg:w-72 h-28 flex items-center gap-4">
            {/* decorative rings */}
            <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full border-[14px] border-white/10 pointer-events-none" />
            <div className="absolute -right-10 -bottom-8 h-36 w-36 rounded-full border-[12px] border-white/5 pointer-events-none" />
            <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 border border-white/20 backdrop-blur-xs">
              <BedDouble className="h-6 w-6 text-white" />
            </div>
            <div className="relative z-10 min-w-0">
              <p className="text-sm font-black leading-snug">Find your perfect stay</p>
              <p className="mt-1 text-xs text-indigo-200 font-medium">Safe · Affordable · Comfortable</p>
              <div className="mt-1.5 flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400 fill-amber-400" />
                <span className="text-[10px] font-bold text-amber-300">Zero brokerage guaranteed</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Filter Pills Row — with right fade overflow indicator */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-b border-gray-100 py-3.5">
          <div className="relative flex-1 min-w-0">
            {/* fade mask — signals scrollable overflow to the right */}
            <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white to-transparent z-10" />
            <div
              ref={pillsRef}
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth pb-0.5"
            >
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

        {/* Date Selection Bar — styled month/day/year dropdowns */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-orange-50/40 border border-orange-100 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-end gap-3">
            <StyledDateSelect
              label="Check-in"
              value={startDate}
              onChange={(iso) => {
                setStartDate(iso);
                if (endDate <= iso) {
                  const bumped = new Date(`${iso}T12:00:00`);
                  bumped.setDate(bumped.getDate() + (isHotelTile ? 1 : 30));
                  setEndDate(bumped.toISOString().slice(0, 10));
                }
                setCurrentPage(1);
              }}
              min={new Date().toISOString().slice(0, 10)}
            />

            <span className="text-gray-400 font-bold text-base mb-1">→</span>

            <StyledDateSelect
              label="Check-out"
              value={endDate}
              onChange={(iso) => {
                setEndDate(iso);
                setCurrentPage(1);
              }}
              min={startDate}
            />

            {startDate && endDate && (
              <div className="mb-0.5">
                <DateRangeSummary startDate={startDate} endDate={endDate} isHotelTile={isHotelTile} />
              </div>
            )}

            {startDate && endDate && (
              <button
                type="button"
                onClick={() => {
                  setStartDate(defaultStayStartDate());
                  setEndDate(defaultStayEndDate({ hotel: isHotelTile }));
                  setCurrentPage(1);
                }}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 underline cursor-pointer mb-0.5"
              >
                Reset Dates
              </button>
            )}
          </div>

          {(activePill !== "all" || drawerLocality || drawerMaxPrice < 100000 || drawerSharing || drawerMinCapacity > 0) && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#b84814] hover:text-[#f87000] cursor-pointer mb-0.5"
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
            {totalItems === 1 ? "property" : "properties"}
            {localityScope ? ` ${localityScope}` : ""}
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
            {Array.from({ length: 9 }).map((_, idx) => (
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
                startDate={startDate}
                endDate={endDate}
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

              {/* Sharing Type (shared-occupancy subcategories only) or Sleeps-Up-To
                  (entire-unit subcategories only) -- driven by what the backend actually
                  seeded for this service, never a hardcoded list that could offer sharing
                  options on a villa/apartment tile. */}
              {isSharedTile && sharingFilterDef && (
                <div className="mt-5">
                  <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider">
                    {sharingFilterDef.prompt}
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[{ label: "All Sharing", value: "" }, ...sharingFilterDef.options.map((o) => ({
                      label: o.label,
                      value: o.code,
                    }))].map((opt) => (
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
              )}

              {isHotelTile && roomClassFilterDef && (
                <div className="mt-5">
                  <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider">
                    {roomClassFilterDef.prompt}
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[{ label: "All classes", value: "" }, ...roomClassFilterDef.options.map((o) => ({
                      label: o.label,
                      value: o.code,
                    }))].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDrawerRoomClass(opt.value)}
                        className={`rounded-xl py-2 px-3 text-xs font-bold border transition-colors ${
                          drawerRoomClass === opt.value
                            ? "bg-orange-50 border-[#f87000] text-[#b84814]"
                            : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {usesCapacityFilter && capacityFilterDef && (
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-navy-900 uppercase tracking-wider">
                      {capacityFilterDef.prompt}
                    </span>
                    <span className="font-black text-[#f87000]">
                      {drawerMinCapacity > 0 ? `Sleeps ${drawerMinCapacity}+` : "Any Size"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[{ label: "Any Size", value: 0 }, ...capacityFilterDef.options.map((o) => ({
                      label: o.label,
                      value: Number(o.code),
                    }))].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDrawerMinCapacity(opt.value)}
                        className={`rounded-xl py-2 px-3 text-xs font-bold border transition-colors ${
                          drawerMinCapacity === opt.value
                            ? "bg-orange-50 border-[#f87000] text-[#b84814]"
                            : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

              {/* Check-In / Check-Out Dates in drawer — styled selects */}
              <div className="mt-5">
                <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider mb-3">
                  Check-in / Check-out Dates
                </label>
                <div className="space-y-3">
                  <StyledDateSelect
                    label="Move-in"
                    value={startDate}
                    onChange={(iso) => setStartDate(iso)}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                  <StyledDateSelect
                    label="Move-out"
                    value={endDate}
                    onChange={(iso) => setEndDate(iso)}
                    min={startDate}
                  />
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
