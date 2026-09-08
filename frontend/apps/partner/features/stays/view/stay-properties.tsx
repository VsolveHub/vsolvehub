"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  DoorClosed,
  DoorOpen,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Users,
  AlertCircle,
  Clock,
  X,
  Settings,
  Sparkles,
  Sliders,
  DollarSign,
  FileText,
  ShieldAlert,
  Star,
  LayoutList,
  LayoutGrid,
} from "lucide-react";

import {
  usePartnerStayProperties,
  usePartnerCreateProperty,
  usePartnerPropertyUnits,
  usePartnerPropertyUnitTypes,
  usePartnerAddUnit,
  usePartnerBlockUnit,
  usePartnerUnitTypes,
  usePartnerCreateUnitType,
  usePartnerPricingRules,
  usePartnerCreatePricingRule,
  usePartnerPropertyPolicy,
  usePartnerUpdatePropertyPolicy,
  type PartnerPropertyOverview,
  type PartnerUnitTypeItem,
  type PartnerPricingRuleItem,
  type PartnerPropertyPolicyItem,
} from "@/features/stays/queries";

interface PropertyCardData {
  id: string;
  title: string;
  locality: string;
  property_type: string;
  property_type_display: string;
  rating: number;
  description: string;
  total_units: number;
  active_guests: number;
  vacant_units: number;
  image_url: string;
  is_active: boolean;
}

/* =========================================================================
   SUBURBAN HOUSE HERO ILLUSTRATION
   ========================================================================= */
function HeroHouseIllustration() {
  return (
    <div className="relative h-20 w-32 shrink-0 sm:h-24 sm:w-36">
      <svg
        viewBox="0 0 160 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full drop-shadow-xs"
        aria-hidden="true"
      >
        <circle cx="128" cy="24" r="16" fill="#fef08a" fillOpacity="0.45" />
        <ellipse cx="40" cy="22" rx="20" ry="8" fill="#e0f2fe" fillOpacity="0.6" />
        <ellipse cx="90" cy="18" rx="16" ry="6" fill="#e0f2fe" fillOpacity="0.6" />
        <ellipse cx="80" cy="108" rx="84" ry="24" fill="#bbf7d0" />
        <ellipse cx="80" cy="104" rx="80" ry="18" fill="#86efac" />
        <rect x="22" y="58" width="4" height="22" rx="2" fill="#a16207" />
        <circle cx="24" cy="52" r="13" fill="#4ade80" />
        <circle cx="21" cy="48" r="9" fill="#22c55e" />
        <rect x="36" y="66" width="3" height="14" rx="1.5" fill="#a16207" />
        <circle cx="37.5" cy="62" r="8.5" fill="#16a34a" />
        <rect x="136" y="60" width="4" height="20" rx="2" fill="#a16207" />
        <circle cx="138" cy="52" r="12" fill="#4ade80" />
        <circle cx="140" cy="49" r="8" fill="#22c55e" />
        <rect x="48" y="44" width="66" height="38" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
        <rect x="94" y="24" width="8" height="18" rx="1" fill="#cbd5e1" />
        <rect x="92" y="23" width="12" height="3" rx="1" fill="#94a3b8" />
        <path d="M44 45L81 20L118 45H44Z" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M81 20L118 45H114L81 22.5L48 45H44L81 20Z" fill="#64748b" />
        <rect x="58" y="50" width="12" height="12" rx="1.5" fill="#e0f2fe" stroke="#64748b" strokeWidth="1" />
        <line x1="64" y1="50" x2="64" y2="62" stroke="#64748b" strokeWidth="0.75" />
        <line x1="58" y1="56" x2="70" y2="56" stroke="#64748b" strokeWidth="0.75" />
        <rect x="92" y="50" width="12" height="12" rx="1.5" fill="#e0f2fe" stroke="#64748b" strokeWidth="1" />
        <line x1="98" y1="50" x2="98" y2="62" stroke="#64748b" strokeWidth="0.75" />
        <line x1="92" y1="56" x2="104" y2="56" stroke="#64748b" strokeWidth="0.75" />
        <rect x="58" y="68" width="12" height="12" rx="1.5" fill="#e0f2fe" stroke="#64748b" strokeWidth="1" />
        <line x1="64" y1="68" x2="64" y2="80" stroke="#64748b" strokeWidth="0.75" />
        <line x1="58" y1="74" x2="70" y2="74" stroke="#64748b" strokeWidth="0.75" />
        <rect x="80" y="66" width="10" height="16" rx="1" fill="#78716c" stroke="#57534e" strokeWidth="1" />
        <circle cx="88" cy="74" r="0.8" fill="#fef08a" />
        <circle cx="50" cy="81" r="5" fill="#22c55e" />
        <circle cx="112" cy="81" r="5" fill="#22c55e" />
      </svg>
    </div>
  );
}

/* =========================================================================
   MAIN COMPONENT: StayProperties
   ========================================================================= */
export function StayProperties() {
  const { data: properties, isLoading, isError, error } = usePartnerStayProperties();
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedPropertyForUnits, setSelectedPropertyForUnits] = useState<PartnerPropertyOverview | null>(null);
  const [activeManagementTab, setActiveManagementTab] = useState<"units" | "unit_types" | "pricing" | "policy">("units");

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("ALL");
  const [selectedLocation, setSelectedLocation] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("RECENT");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const allProps = properties ?? [];

  // Build the list combining API data with canonical metadata matching Image 3
  const displayProperties: PropertyCardData[] = useMemo(() => {
    return allProps.map((p) => {
      const total = p.total_units;
      const active = p.active_guests;
      const vacant = Math.max(0, total - active);

      return {
        id: p.id,
        title: p.title,
        locality: p.locality,
        property_type: p.property_type,
        property_type_display: p.property_type_display,
        rating: p.rating,
        description: "",
        total_units: total,
        active_guests: active,
        vacant_units: vacant,
        image_url: p.image_url,
        is_active: p.is_active,
      };
    });
  }, [allProps]);

  // Filtered properties
  const filteredProperties = useMemo(() => {
    return displayProperties.filter((prop) => {
      const matchSearch =
        searchQuery === "" ||
        prop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prop.locality.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prop.property_type_display.toLowerCase().includes(searchQuery.toLowerCase());

      const matchType = selectedType === "ALL" || prop.property_type === selectedType;

      const matchLocation =
        selectedLocation === "ALL" ||
        prop.locality.toLowerCase().includes(selectedLocation.toLowerCase());

      const matchStatus =
        selectedStatus === "ALL" ||
        (selectedStatus === "ACTIVE" && prop.is_active) ||
        (selectedStatus === "INACTIVE" && !prop.is_active);

      return matchSearch && matchType && matchLocation && matchStatus;
    });
  }, [displayProperties, searchQuery, selectedType, selectedLocation, selectedStatus]);

  const totalPropertiesCount = displayProperties.length;
  const totalUnitsCount = displayProperties.reduce((acc, p) => acc + p.total_units, 0);

  if (isLoading) {
    return (
      <div className="w-full pb-20 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-sm text-neutral-500 flex items-center gap-2">
          <Clock className="h-4 w-4 animate-spin text-neutral-400" />
          Loading your properties and units…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full pb-20 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error instanceof Error ? error.message : "Unable to load properties."}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4.5rem)] bg-[#fafafa] pb-20 pt-6 sm:pt-8 text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* =========================================================================
            HEADER & HERO SECTION (MATCHING IMAGE 3)
            ========================================================================= */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f0ff] border border-[#e9d5ff] px-3.5 py-1 text-xs font-semibold text-[#7c3aed]">
              <Building2 className="h-3.5 w-3.5" />
              <span>Properties &amp; Inventory</span>
            </div>
            <h1 className="mt-2.5 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
              Properties &amp; Units
            </h1>
            <p className="mt-1 text-sm sm:text-base text-neutral-500">
              Manage your residential complexes, PGs, villas, room configurations and physical unit inventory.
            </p>
          </div>

          {/* Right Hero Section: Suburban House Graphic + Dual Metric Cards */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
            <HeroHouseIllustration />

            {/* Metric Card 1: Total Properties */}
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white px-4 py-3 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-extrabold text-neutral-900 leading-tight">
                  {totalPropertiesCount}
                </div>
                <div className="text-xs text-neutral-400 font-medium">Total Properties</div>
              </div>
            </div>

            {/* Metric Card 2: Total Units */}
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white px-4 py-3 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-extrabold text-neutral-900 leading-tight">
                  {totalUnitsCount}
                </div>
                <div className="text-xs text-neutral-400 font-medium">Total Units</div>
              </div>
            </div>

            {/* Optional Quick Add Property Button */}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors"
              title="Add New Property"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            SEARCH & FILTER CONTROL BAR (MATCHING IMAGE 3)
            ========================================================================= */}
        <div className="mt-6 rounded-2xl border border-neutral-200/70 bg-white p-3 shadow-xs flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[260px] flex items-center">
            <Search className="h-4 w-4 text-neutral-400 ml-2.5 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search properties by name, location, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none bg-transparent"
            />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Dropdown 1: Property Type */}
          <div className="relative min-w-[130px]">
            <div className="text-[10px] font-bold text-neutral-400 leading-none mb-0.5">Property Type</div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="STUDIO_APT">Studio Apartment</option>
              <option value="INDEPENDENT_HOUSE">Independent House</option>
              <option value="VILLA">Villa</option>
              <option value="COMMERCIAL">Commercial / Office</option>
              <option value="PG">PG Accommodation</option>
              <option value="HOSTEL">Hostel</option>
              <option value="CO_LIVING">Co-Living Space</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-0.5 right-0 h-3.5 w-3.5 text-neutral-400" />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Dropdown 2: Location */}
          <div className="relative min-w-[120px]">
            <div className="text-[10px] font-bold text-neutral-400 leading-none mb-0.5">Location</div>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Locations</option>
              <option value="Madhapur">Madhapur</option>
              <option value="Kondapur">Kondapur</option>
              <option value="Gachibowli">Gachibowli</option>
              <option value="Ameerpet">Ameerpet</option>
              <option value="Hitech City">Hitech City</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-0.5 right-0 h-3.5 w-3.5 text-neutral-400" />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Dropdown 3: Status */}
          <div className="relative min-w-[100px]">
            <div className="text-[10px] font-bold text-neutral-400 leading-none mb-0.5">Status</div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-0.5 right-0 h-3.5 w-3.5 text-neutral-400" />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Dropdown 4: Sort by */}
          <div className="relative min-w-[130px]">
            <div className="text-[10px] font-bold text-neutral-400 leading-none mb-0.5">Sort by</div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer"
            >
              <option value="RECENT">Recently Added</option>
              <option value="UNITS_HIGH">Most Units</option>
              <option value="RATING">Highest Rating</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-0.5 right-0 h-3.5 w-3.5 text-neutral-400" />
          </div>

          {/* View Mode Buttons */}
          <div className="flex items-center gap-1 ml-auto border-l border-neutral-100 pl-2">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === "list"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
              title="List View"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === "grid"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            PROPERTY LISTINGS (MATCHING IMAGE 3)
            ========================================================================= */}
        <div className="mt-5 space-y-4">
          {filteredProperties.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-neutral-300" />
              <h3 className="mt-4 text-base font-bold text-neutral-900">No matching properties found</h3>
              <p className="mt-1 text-xs text-neutral-400">
                Try adjusting your search query or clearing active filters.
              </p>
            </div>
          ) : (
            filteredProperties.map((prop) => (
              <div
                key={prop.id}
                className="group rounded-2xl border border-neutral-200/70 bg-white p-4 sm:p-5 shadow-xs hover:border-neutral-300 hover:shadow-md transition-all flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5"
              >
                {/* Left Block: Thumbnail + Property Description */}
                <div className="flex flex-col sm:flex-row items-start gap-4 flex-1 min-w-0">
                  {/* Thumbnail Image with Units Pill Overlay */}
                  <div className="relative h-24 w-36 sm:h-28 sm:w-44 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    <img
                      src={prop.image_url}
                      alt={prop.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-neutral-900/85 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      <DoorOpen className="h-3 w-3" />
                      <span>
                        {prop.total_units} {prop.total_units === 1 ? "Unit" : "Units"}
                      </span>
                    </div>
                  </div>

                  {/* Main Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-sm sm:text-base font-extrabold text-neutral-900 truncate">
                        {prop.title}
                      </h3>
                      <span className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                        {prop.property_type_display}
                      </span>
                      <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{prop.rating.toFixed(1)}</span>
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                      <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                      <span>{prop.locality}</span>
                    </div>

                    <p className="mt-1 text-xs text-neutral-500 line-clamp-1">
                      {prop.description}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span>Verified Host Listing</span>
                      </span>
                      <span className="rounded-full bg-teal-50 border border-teal-200/60 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
                        Active
                      </span>
                      {prop.total_units > 0 && prop.has_pricing === false && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 animate-pulse">
                          <AlertCircle className="h-3 w-3 text-amber-600" />
                          <span>Pricing Setup Required</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Block: 3 Mini Stat Blocks + Action Buttons */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between xl:justify-end gap-3 sm:gap-5 w-full xl:w-auto pt-3 xl:pt-0 border-t xl:border-t-0 border-neutral-100">
                  {/* Mini Stat 1: Total Units */}
                  <div className="flex flex-col items-center justify-center rounded-xl bg-blue-50/50 border border-blue-100/70 p-2.5 min-w-[76px] text-center">
                    <DoorOpen className="h-4 w-4 text-blue-600 mb-1" />
                    <span className="text-base font-black text-neutral-900 leading-none">
                      {prop.total_units}
                    </span>
                    <span className="text-[10px] font-medium text-neutral-400 mt-0.5">
                      {prop.total_units === 1 ? "Total Unit" : "Total Units"}
                    </span>
                  </div>

                  {/* Mini Stat 2: Active Guests */}
                  <div className="flex flex-col items-center justify-center rounded-xl bg-emerald-50/50 border border-emerald-100/70 p-2.5 min-w-[76px] text-center">
                    <Users className="h-4 w-4 text-emerald-600 mb-1" />
                    <span className="text-base font-black text-neutral-900 leading-none">
                      {prop.active_guests}
                    </span>
                    <span className="text-[10px] font-medium text-neutral-400 mt-0.5">Active Guests</span>
                  </div>

                  {/* Mini Stat 3: Vacant Units */}
                  <div className="flex flex-col items-center justify-center rounded-xl bg-orange-50/50 border border-orange-100/70 p-2.5 min-w-[76px] text-center">
                    <DoorClosed className="h-4 w-4 text-orange-600 mb-1" />
                    <span className="text-xs font-bold text-neutral-900 leading-none">Vacant</span>
                    <span className="text-[10px] font-medium text-neutral-400 mt-0.5">
                      {prop.vacant_units} {prop.vacant_units === 1 ? "Unit" : "Units"}
                    </span>
                  </div>

                  {/* Action Buttons Column */}
                  <div className="flex flex-col gap-1.5 min-w-[130px]">
                    <button
                      type="button"
                      onClick={() => {
                        const existing = allProps.find((item) => item.id === prop.id);
                        setActiveManagementTab("units");
                        if (existing) {
                          setSelectedPropertyForUnits(existing);
                        } else {
                          setSelectedPropertyForUnits({
                            id: prop.id,
                            title: prop.title,
                            property_type: prop.property_type,
                            property_type_display: prop.property_type_display,
                            locality: prop.locality,
                            rating: prop.rating,
                            total_units: prop.total_units,
                            active_guests: prop.active_guests,
                            image_url: prop.image_url,
                            is_active: prop.is_active,
                          });
                        }
                      }}
                      className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <DoorOpen className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Rooms ({prop.total_units})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const existing = allProps.find((item) => item.id === prop.id);
                        setActiveManagementTab("unit_types");
                        if (existing) setSelectedPropertyForUnits(existing);
                      }}
                      className={
                        prop.total_units > 0 && prop.has_pricing === false
                          ? "rounded-xl border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-900 hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                          : "rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-1.5"
                      }
                    >
                      <Sliders className={`h-3.5 w-3.5 ${prop.total_units > 0 && prop.has_pricing === false ? "text-amber-700" : "text-neutral-500"}`} />
                      <span>Setup &amp; Pricing</span>
                    </button>

                    <Link
                      href={`/stays/reservations?property=${prop.id}`}
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CalendarCheck className="h-3.5 w-3.5 text-neutral-500" />
                      <span>Bookings ({prop.active_guests})</span>
                    </Link>
                  </div>

                  {/* Options Menu Button */}
                  <button
                    type="button"
                    onClick={() => {
                      const existing = allProps.find((item) => item.id === prop.id);
                      setActiveManagementTab("policy");
                      if (existing) setSelectedPropertyForUnits(existing);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition-colors shrink-0"
                    title="Property Policies"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* =========================================================================
            BOTTOM PAGINATION BAR (MATCHING IMAGE 3)
            ========================================================================= */}
        <div className="mt-8 flex items-center justify-between text-xs text-neutral-400">
          <div>Showing {filteredProperties.length} properties</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-300 cursor-not-allowed"
            >
              ‹
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-xs"
            >
              1
            </button>
            <button
              type="button"
              disabled
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-300 cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODALS
          ========================================================================= */}
      {showCreateModal && (
        <CreatePropertyModal onClose={() => setShowCreateModal(false)} />
      )}

      {selectedPropertyForUnits && (
        <ManagePropertyModal
          property={selectedPropertyForUnits}
          initialTab={activeManagementTab}
          onClose={() => setSelectedPropertyForUnits(null)}
        />
      )}
    </div>
  );
}

/* =========================================================================
   CREATE PROPERTY MODAL
   ========================================================================= */
function CreatePropertyModal({ onClose }: { onClose: () => void }) {
  const createMutation = usePartnerCreateProperty();
  const [title, setTitle] = useState("");
  const [propertyType, setPropertyType] = useState("PG");
  const [locality, setLocality] = useState("");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        title,
        property_type: propertyType,
        locality,
        description,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to register property.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-neutral-900">Register New Property</h3>
            <p className="text-xs text-neutral-500">
              Add a residential compound, PG, hostel, or apartment to your host portfolio
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitError && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-700">Property Title / Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Sri Sai Luxury PG for Gents"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700">Property Category</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ROOMS">Rooms</option>
                <option value="PG">PG Accommodation</option>
                <option value="HOSTEL">Hostels</option>
                <option value="BED_SPACE">Bed Space</option>
                <option value="CO_LIVING">Co-Living Spaces</option>
                <option value="APARTMENT">Apartments</option>
                <option value="RENTAL_PROPERTY">Rental Properties</option>
                <option value="SHORT_STAY">Short Stay</option>
                <option value="STUDENT_ACCOMMODATION">Student Accommodation</option>
                <option value="WORKER_ACCOMMODATION">Worker Accommodation</option>
                <option value="PROPERTY_LISTING">Property Listing</option>
                <option value="PREMIUM_STAYS">Premium Stays</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700">Locality &amp; City</label>
              <input
                type="text"
                required
                placeholder="e.g. Gachibowli, Hyderabad"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Description &amp; Highlights</label>
            <textarea
              rows={3}
              placeholder="Amenities, proximity to tech parks, food options, security features..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Registering…" : "Register Property"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   MANAGE PROPERTY MODAL (UNITS, CONFIGURATIONS, PRICING & POLICIES)
   ========================================================================= */
function ManagePropertyModal({
  property,
  initialTab = "units",
  onClose,
}: {
  property: PartnerPropertyOverview;
  initialTab?: "units" | "unit_types" | "pricing" | "policy";
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"units" | "unit_types" | "pricing" | "policy">(initialTab);

  // Queries
  const { data: units, isLoading: unitsLoading } = usePartnerPropertyUnits(property.id);
  const { data: unitTypes, isLoading: unitTypesLoading } = usePartnerPropertyUnitTypes(property.id);
  const { data: policy, isLoading: policyLoading } = usePartnerPropertyPolicy(property.id);

  // Mutations
  const addUnitMutation = usePartnerAddUnit();
  const blockUnitMutation = usePartnerBlockUnit();
  const createUnitTypeMutation = usePartnerCreateUnitType();
  const createPricingRuleMutation = usePartnerCreatePricingRule();
  const updatePolicyMutation = usePartnerUpdatePropertyPolicy();

  // Unit State
  const [unitCode, setUnitCode] = useState("");
  const [selectedUnitTypeForUnit, setSelectedUnitTypeForUnit] = useState("");
  const [floor, setFloor] = useState("1st Floor");
  const [blockingUnitId, setBlockingUnitId] = useState<string | null>(null);

  // Unit Type State
  const [typeName, setTypeName] = useState("");
  const [typeBhk, setTypeBhk] = useState("1_BHK");
  const [typeSharing, setTypeSharing] = useState("PRIVATE");
  const [typeSharingCount, setTypeSharingCount] = useState(1);
  const [typeIsAc, setTypeIsAc] = useState(true);
  const [typeBathroom, setTypeBathroom] = useState("ATTACHED");
  const [typeFurnishing, setTypeFurnishing] = useState("FULLY_FURNISHED");
  const [typeFoodIncluded, setTypeFoodIncluded] = useState(false);
  const [showAddTypeForm, setShowAddTypeForm] = useState(false);

  // Pricing State
  const [selectedUnitTypeForPricing, setSelectedUnitTypeForPricing] = useState("");
  const { data: pricingRules, isLoading: pricingLoading } = usePartnerPricingRules(
    selectedUnitTypeForPricing || undefined
  );
  const [priceDurationMode, setPriceDurationMode] = useState<"MONTHLY" | "WEEKLY" | "DAILY" | "NIGHTLY">("MONTHLY");
  const [priceBaseRateRupees, setPriceBaseRateRupees] = useState("15000");
  const [priceDepositRupees, setPriceDepositRupees] = useState("30000");
  const [priceMaintenanceRupees, setPriceMaintenanceRupees] = useState("2000");
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAddPricingForm, setShowAddPricingForm] = useState(false);

  // Policy State
  const [policyCheckIn, setPolicyCheckIn] = useState("12:00:00");
  const [policyCheckOut, setPolicyCheckOut] = useState("11:00:00");
  const [policyMaxGuests, setPolicyMaxGuests] = useState(2);
  const [policyIdVerification, setPolicyIdVerification] = useState(true);
  const [policyCancellation, setPolicyCancellation] = useState<"FLEXIBLE" | "MODERATE" | "STRICT" | "NON_REFUNDABLE">("MODERATE");
  const [policyNoticeDays, setPolicyNoticeDays] = useState(30);
  const [policyHouseRules, setPolicyHouseRules] = useState("Standard house rules apply. Keep quiet hours after 10 PM.");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const availableTypes = unitTypes ?? [];
  const currentUnits = units ?? [];
  const currentPricingRules = pricingRules ?? [];

  // Sync initial dropdown selections
  React.useEffect(() => {
    const first = availableTypes[0];
    if (first) {
      if (!selectedUnitTypeForUnit) setSelectedUnitTypeForUnit(first.id);
      if (!selectedUnitTypeForPricing) setSelectedUnitTypeForPricing(first.id);
    }
  }, [availableTypes, selectedUnitTypeForUnit, selectedUnitTypeForPricing]);

  // Sync policy data when loaded
  React.useEffect(() => {
    if (policy) {
      setPolicyCheckIn(policy.check_in_time || "12:00:00");
      setPolicyCheckOut(policy.check_out_time || "11:00:00");
      setPolicyMaxGuests(policy.max_guests_per_unit || 2);
      setPolicyIdVerification(Boolean(policy.id_verification_required));
      setPolicyCancellation(policy.cancellation_policy || "MODERATE");
      setPolicyNoticeDays(policy.notice_period_days || 30);
      setPolicyHouseRules(policy.house_rules || "");
    }
  }, [policy]);

  const clearAlerts = () => {
    setSubmitError(null);
    setSuccessMsg(null);
  };

  const handleBlockUnit = async (uId: string, uCode: string) => {
    if (
      !confirm(
        `Are you sure you want to mark Room ${uCode} under maintenance? Confirmed reservations will automatically move to recovery.`
      )
    ) {
      return;
    }
    setBlockingUnitId(uId);
    clearAlerts();
    try {
      const res = await blockUnitMutation.mutateAsync({ unitId: uId, reason: "Host maintenance block" });
      setSuccessMsg(`Room ${uCode} marked under maintenance (${res.impacted_reservations} reservations in recovery)`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to mark unit under maintenance.");
    } finally {
      setBlockingUnitId(null);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!selectedUnitTypeForUnit) {
      setSubmitError("Please select a room configuration / unit type.");
      return;
    }
    try {
      const res = await addUnitMutation.mutateAsync({
        propertyId: property.id,
        unit_type: selectedUnitTypeForUnit,
        unit_code: unitCode,
        floor,
      });
      setSuccessMsg(`Room ${res.unit_code} successfully registered!`);
      setUnitCode("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create physical unit.");
    }
  };

  const handleCreateUnitType = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!typeName.trim()) {
      setSubmitError("Room configuration name is required.");
      return;
    }
    try {
      const res = await createUnitTypeMutation.mutateAsync({
        propertyId: property.id,
        name: typeName,
        bhk: typeBhk,
        sharing_type: typeSharing,
        sharing_count: Number(typeSharingCount) || 1,
        is_ac: typeIsAc,
        bathroom_type: typeBathroom,
        furnishing_status: typeFurnishing,
        food_included: typeFoodIncluded,
      });
      setSuccessMsg(`Configuration "${res.name}" created successfully!`);
      setTypeName("");
      setShowAddTypeForm(false);
      setSelectedUnitTypeForUnit(res.id);
      setSelectedUnitTypeForPricing(res.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create room configuration.");
    }
  };

  const handleCreatePricingRule = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!selectedUnitTypeForPricing) {
      setSubmitError("Please select a room configuration first.");
      return;
    }
    const basePaise = Math.round(Number(priceBaseRateRupees) * 100);
    const depositPaise = Math.round(Number(priceDepositRupees) * 100);
    const maintPaise = Math.round(Number(priceMaintenanceRupees) * 100);
    if (isNaN(basePaise) || basePaise <= 0) {
      setSubmitError("Please enter a valid positive base rent.");
      return;
    }
    try {
      await createPricingRuleMutation.mutateAsync({
        unitTypeId: selectedUnitTypeForPricing,
        duration_mode: priceDurationMode,
        base_rate_paise: basePaise,
        deposit_paise: depositPaise || 0,
        maintenance_paise: maintPaise || 0,
        effective_from: priceEffectiveFrom,
        is_active: true,
      });
      setSuccessMsg(`Pricing rule for ${priceDurationMode} saved successfully!`);
      setShowAddPricingForm(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save pricing rule.");
    }
  };

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      await updatePolicyMutation.mutateAsync({
        propertyId: property.id,
        check_in_time: policyCheckIn,
        check_out_time: policyCheckOut,
        max_guests_per_unit: Number(policyMaxGuests) || 2,
        id_verification_required: policyIdVerification,
        cancellation_policy: policyCancellation,
        notice_period_days: Number(policyNoticeDays) || 30,
        house_rules: policyHouseRules,
      });
      setSuccessMsg("Property policies updated and versioned successfully!");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update property policies.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-neutral-900">{property.title}</h3>
              <p className="text-xs text-neutral-500">{property.locality} • {property.property_type_display}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-neutral-100 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => { clearAlerts(); setActiveTab("units"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === "units"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <DoorOpen className="h-3.5 w-3.5" />
            <span>Rooms ({currentUnits.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { clearAlerts(); setActiveTab("unit_types"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === "unit_types"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Configurations ({availableTypes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { clearAlerts(); setActiveTab("pricing"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === "pricing"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>Pricing Rules</span>
          </button>

          <button
            type="button"
            onClick={() => { clearAlerts(); setActiveTab("policy"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === "policy"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Stay Policies</span>
          </button>
        </div>

        {/* Global Feedback Banners */}
        {submitError && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-center gap-2 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        {successMsg && (
          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200 flex items-center gap-2 shrink-0">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Tab Body */}
        <div className="overflow-y-auto space-y-6 pt-4 pr-1 flex-1">
          {/* TAB 1: PHYSICAL ROOMS */}
          {activeTab === "units" && (
            <div className="space-y-6">
              {availableTypes.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>No room configurations exist yet. You must define a room configuration before adding physical rooms.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("unit_types")}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 shrink-0"
                  >
                    + Create Configuration
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-indigo-600" /> Add Physical Room / Bed Unit
                  </h4>

                  <form onSubmit={handleAddUnit} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Room Configuration</label>
                      <select
                        required
                        value={selectedUnitTypeForUnit}
                        onChange={(e) => setSelectedUnitTypeForUnit(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      >
                        {availableTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.bhk || t.sharing_display})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Room Code / Door No.</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 101, A-2, Bed 1"
                        value={unitCode}
                        onChange={(e) => setUnitCode(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Floor</label>
                      <input
                        type="text"
                        placeholder="e.g. 1st Floor, Ground Floor"
                        value={floor}
                        onChange={(e) => setFloor(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3 flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={addUnitMutation.isPending}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        {addUnitMutation.isPending ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        <span>Save Physical Unit</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Current Units List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider">
                    Physical Inventory ({currentUnits.length} units)
                  </h4>
                  <span className="text-[11px] text-neutral-500">PostgreSQL exclusion-guaranteed availability</span>
                </div>

                {unitsLoading ? (
                  <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4 animate-spin" /> Loading rooms…
                  </div>
                ) : currentUnits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-xs text-neutral-500">
                    No physical units added yet. Use the form above to add your first room.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {currentUnits.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 hover:border-neutral-300 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-neutral-900 flex items-center gap-1">
                            <DoorOpen className="h-3.5 w-3.5 text-indigo-600" /> {u.unit_code}
                          </strong>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              u.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {u.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-600 line-clamp-1">{u.unit_type_name}</p>
                        <div className="mt-2 flex items-center justify-between border-t border-neutral-200/50 pt-1.5">
                          <span className="text-[10px] text-neutral-400">{u.floor || "Standard"}</span>
                          {u.status === "ACTIVE" && (
                            <button
                              type="button"
                              disabled={blockingUnitId === u.id}
                              onClick={() => handleBlockUnit(u.id, u.unit_code)}
                              className="rounded px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50 transition-colors"
                            >
                              {blockingUnitId === u.id ? "Blocking…" : "Block"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ROOM CONFIGURATIONS (UNIT TYPES) */}
          {activeTab === "unit_types" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
                    Room Configurations ({availableTypes.length})
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Define floor plans, BHK types, sharing options, and amenities for this property.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddTypeForm(!showAddTypeForm)}
                  className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{showAddTypeForm ? "Close Form" : "New Configuration"}</span>
                </button>
              </div>

              {/* Add Room Configuration Form */}
              {showAddTypeForm && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                  <h5 className="text-xs font-black text-indigo-900 mb-3">Create Room Configuration</h5>
                  <form onSubmit={handleCreateUnitType} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Configuration Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Deluxe Single AC Room, 1 BHK Suite"
                          value={typeName}
                          onChange={(e) => setTypeName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">BHK / Layout</label>
                        <select
                          value={typeBhk}
                          onChange={(e) => setTypeBhk(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="1_RK">1 RK</option>
                          <option value="1_BHK">1 BHK</option>
                          <option value="2_BHK">2 BHK</option>
                          <option value="3_BHK">3 BHK</option>
                          <option value="STUDIO">Studio</option>
                          <option value="COMMERCIAL">Commercial</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Sharing Type</label>
                        <select
                          value={typeSharing}
                          onChange={(e) => setTypeSharing(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="PRIVATE">Private (Single)</option>
                          <option value="DOUBLE_SHARING">Double Sharing</option>
                          <option value="TRIPLE_SHARING">Triple Sharing</option>
                          <option value="FOUR_SHARING">Four Sharing</option>
                          <option value="DORMITORY">Dormitory</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Bathroom</label>
                        <select
                          value={typeBathroom}
                          onChange={(e) => setTypeBathroom(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="ATTACHED">Attached</option>
                          <option value="COMMON">Common</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Furnishing</label>
                        <select
                          value={typeFurnishing}
                          onChange={(e) => setTypeFurnishing(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="FULLY_FURNISHED">Fully Furnished</option>
                          <option value="SEMI_FURNISHED">Semi Furnished</option>
                          <option value="UNFURNISHED">Unfurnished</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 pt-1">
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={typeIsAc}
                          onChange={(e) => setTypeIsAc(e.target.checked)}
                          className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <span>Air Conditioned (AC)</span>
                      </label>

                      <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={typeFoodIncluded}
                          onChange={(e) => setTypeFoodIncluded(e.target.checked)}
                          className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <span>Food / Meals Included</span>
                      </label>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={createUnitTypeMutation.isPending}
                        className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {createUnitTypeMutation.isPending ? "Creating…" : "Save Room Configuration"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* List of configurations */}
              {unitTypesLoading ? (
                <div className="py-8 text-center text-xs text-neutral-400">Loading configurations…</div>
              ) : availableTypes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-xs text-neutral-500">
                  No room configurations created yet. Click &quot;New Configuration&quot; above to get started.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableTypes.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs hover:border-neutral-300 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <h5 className="font-extrabold text-xs text-neutral-900">{t.name}</h5>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                          {t.bhk || "Studio"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">
                          {t.sharing_display || t.sharing_type}
                        </span>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">
                          {t.is_ac ? "AC Room" : "Non-AC"}
                        </span>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">
                          {t.bathroom_type} Bath
                        </span>
                        {t.food_included && (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 border border-emerald-200">
                            Food Included
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-[11px] text-neutral-500">
                        <span>{t.units_count ?? 0} Physical Units</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUnitTypeForPricing(t.id);
                            setActiveTab("pricing");
                          }}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          View Pricing →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRICING RULES */}
          {activeTab === "pricing" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-neutral-700">Configuration:</label>
                  <select
                    value={selectedUnitTypeForPricing}
                    onChange={(e) => setSelectedUnitTypeForPricing(e.target.value)}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {availableTypes.length === 0 ? (
                      <option value="">No configurations available</option>
                    ) : (
                      availableTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {availableTypes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddPricingForm(!showAddPricingForm)}
                    className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{showAddPricingForm ? "Close Form" : "Add Pricing Rule"}</span>
                  </button>
                )}
              </div>

              {/* Add Pricing Form */}
              {showAddPricingForm && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                  <h5 className="text-xs font-black text-indigo-900 mb-3">Add Rate &amp; Deposit Schedule</h5>
                  <form onSubmit={handleCreatePricingRule} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Duration Mode</label>
                        <select
                          value={priceDurationMode}
                          onChange={(e) => setPriceDurationMode(e.target.value as "MONTHLY" | "WEEKLY" | "DAILY" | "NIGHTLY")}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="MONTHLY">Monthly Lease (Rent / mo)</option>
                          <option value="WEEKLY">Weekly Stay (Rate / wk)</option>
                          <option value="DAILY">Daily Stay (Rate / day)</option>
                          <option value="NIGHTLY">Nightly Stay (Rate / night)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Base Tariff (₹)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="e.g. 15000"
                          value={priceBaseRateRupees}
                          onChange={(e) => setPriceBaseRateRupees(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Refundable Deposit (₹)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 30000"
                          value={priceDepositRupees}
                          onChange={(e) => setPriceDepositRupees(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Monthly Maintenance (₹)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 2000"
                          value={priceMaintenanceRupees}
                          onChange={(e) => setPriceMaintenanceRupees(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700">Effective From Date</label>
                        <input
                          type="date"
                          required
                          value={priceEffectiveFrom}
                          onChange={(e) => setPriceEffectiveFrom(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={createPricingRuleMutation.isPending}
                        className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {createPricingRuleMutation.isPending ? "Saving…" : "Save Pricing Rule"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Pricing Rules List */}
              {pricingLoading ? (
                <div className="py-8 text-center text-xs text-neutral-400">Loading pricing rules…</div>
              ) : currentPricingRules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-xs text-neutral-500">
                  No pricing rules configured for this room type. Click &quot;Add Pricing Rule&quot; to set rates and enable booking.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {currentPricingRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs flex items-center justify-between flex-wrap gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-black text-indigo-700">
                          {rule.duration_mode}
                        </span>
                        <div>
                          <strong className="text-sm font-black text-neutral-900">
                            ₹{(rule.base_rate_paise / 100).toLocaleString("en-IN")}
                          </strong>
                          <span className="text-xs text-neutral-500">
                            {" "}• Deposit: ₹{(rule.deposit_paise / 100).toLocaleString("en-IN")}
                            {rule.maintenance_paise > 0 && ` • Maint: ₹${(rule.maintenance_paise / 100).toLocaleString("en-IN")}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
                        <span>From: {rule.effective_from}</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: STAY POLICIES */}
          {activeTab === "policy" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                <div>
                  <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
                    Property Stay &amp; Cancellation Policy
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Versioned cancellation policy, check-in windows, and house rules.
                  </p>
                </div>
                {policy && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200">
                    Version {policy.version}
                  </span>
                )}
              </div>

              {policyLoading ? (
                <div className="py-8 text-center text-xs text-neutral-400">Loading policy…</div>
              ) : (
                <form onSubmit={handleUpdatePolicy} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Check-In Time</label>
                      <input
                        type="text"
                        required
                        placeholder="12:00:00"
                        value={policyCheckIn}
                        onChange={(e) => setPolicyCheckIn(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Check-Out Time</label>
                      <input
                        type="text"
                        required
                        placeholder="11:00:00"
                        value={policyCheckOut}
                        onChange={(e) => setPolicyCheckOut(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Max Guests Per Unit</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={policyMaxGuests}
                        onChange={(e) => setPolicyMaxGuests(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Cancellation Policy</label>
                      <select
                        value={policyCancellation}
                        onChange={(e) =>
                          setPolicyCancellation(
                            e.target.value as "FLEXIBLE" | "MODERATE" | "STRICT" | "NON_REFUNDABLE"
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="FLEXIBLE">Flexible (Full refund up to 24h prior)</option>
                        <option value="MODERATE">Moderate (Full refund up to 5 days prior)</option>
                        <option value="STRICT">Strict (50% refund up to 7 days prior)</option>
                        <option value="NON_REFUNDABLE">Non-Refundable</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700">Move-Out Notice Period (Days)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="30"
                        value={policyNoticeDays}
                        onChange={(e) => setPolicyNoticeDays(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={policyIdVerification}
                        onChange={(e) => setPolicyIdVerification(e.target.checked)}
                        className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span>Mandatory Government ID Verification at Check-In</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-700">House Rules &amp; Living Guidelines</label>
                    <textarea
                      rows={3}
                      placeholder="Specify gate closure times, visitor policies, noise regulations..."
                      value={policyHouseRules}
                      onChange={(e) => setPolicyHouseRules(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={updatePolicyMutation.isPending}
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {updatePolicyMutation.isPending ? "Publishing Policy…" : "Save & Publish Stay Policy"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 border-t border-neutral-100 pt-3 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
