"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarCheck,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  DoorOpen,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Phone,
  Plane,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import {
  usePartnerStayReservations,
  usePartnerCheckIn,
  usePartnerCheckOut,
  usePartnerReassignUnit,
  usePartnerPropertyUnits,
  type PartnerReservationItem,
  type StayReservationStatus,
  type StayCheckInInfo,
  type StayCheckOutInfo,
  type StayReservationLineItem,
} from "@/features/stays/queries";

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

interface DisplayReservation {
  id: string;
  display_id: string;
  property_id: string;
  property_title: string;
  locality: string;
  unit_id: string;
  unit_type_id: string;
  unit_code: string;
  unit_name: string;
  status: StayReservationStatus;
  status_display: string;
  start_date: string;
  end_date: string;
  total_nights: number;
  duration_mode: string;
  guest_count: number;
  guest_code: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  total_amount_paise: number;
  deposit_paise: number;
  deposit_status: string;
  image_url: string;
  lines?: StayReservationLineItem[];
  check_in?: StayCheckInInfo;
  check_out?: StayCheckOutInfo;
}

type TabKey = "ALL" | "NEEDS_ACTION" | "ARRIVALS" | "IN_STAY" | "COMPLETED";

function toPartnerItem(res: DisplayReservation, allRes: PartnerReservationItem[]): PartnerReservationItem {
  const real = allRes.find((item) => item.id === res.id);
  if (!real) throw new Error("Reservation is no longer available.");
  return real;
}

/* =========================================================================
   MAIN COMPONENT: StayReservations
   ========================================================================= */
export function StayReservations() {
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const { data: reservations, isLoading, isError, error } = usePartnerStayReservations();

  // Filter Bar state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("RECENT");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals & Drawer state
  const [drawerReservation, setDrawerReservation] = useState<DisplayReservation | null>(null);
  const [checkInReservation, setCheckInReservation] = useState<PartnerReservationItem | null>(null);
  const [checkOutReservation, setCheckOutReservation] = useState<PartnerReservationItem | null>(null);
  const [reassignReservation, setReassignReservation] = useState<PartnerReservationItem | null>(null);

  const allRes = reservations ?? [];

  const displayReservations: DisplayReservation[] = useMemo(() => {
    return allRes.map((r) => {
      const displayId = r.id.slice(0, 8);
      const unitCodeDisplay = r.unit_code ? `Unit ${r.unit_code}` : "Unit pending";

      let statusDisplay: string = r.status;
      if (r.status === "CONFIRMED") statusDisplay = "Confirmed (Awaiting Arrival)";
      else if (r.status === "CHECKED_IN" || r.status === "IN_STAY") statusDisplay = "In-Stay";
      else if (r.status === "INSPECTED") statusDisplay = "Inspected";
      else if (r.status === "CHECKED_OUT" || r.status === "COMPLETED") statusDisplay = "Completed";

      return {
        id: r.id,
        display_id: displayId,
        property_id: r.property_id || "",
        property_title: r.property_title,
        locality: r.property_locality,
        unit_id: r.unit_id || "",
        unit_type_id: r.unit_type_id || "",
        unit_code: unitCodeDisplay,
        unit_name: r.unit_name,
        status: r.status,
        status_display: statusDisplay,
        start_date: r.start_date,
        end_date: r.end_date,
        total_nights: r.total_nights,
        duration_mode: r.duration_mode.toLowerCase().replace("_", " "),
        guest_count: r.guest_count,
        guest_code: `Guest ${r.customer_id?.slice(0, 8) || "unassigned"}`,
        guest_name: r.guest_name || "Guest details unavailable",
        guest_phone: r.guest_phone || "Not provided",
        guest_email: r.guest_email || "Not provided",
        total_amount_paise: r.total_amount_paise,
        deposit_paise: r.deposit?.authorized_amount_paise ?? r.deposit_amount_paise,
        deposit_status: r.deposit?.status || "NOT_REQUIRED",
        image_url: r.image_url,
        lines: r.lines,
        check_in: r.check_in,
        check_out: r.check_out,
      };
    });
  }, [allRes]);

  // Counts for metric cards and tabs
  const totalCount = displayReservations.length;
  const needsActionCount = displayReservations.filter(
    (r) => r.status === "CONFIRMED" || r.status === "INSPECTED" || r.status === "DISPUTED",
  ).length;
  const arrivalsCount = displayReservations.filter(
    (r) => r.status === "CONFIRMED",
  ).length;
  const inStayCount = displayReservations.filter(
    (r) => r.status === "CHECKED_IN" || r.status === "IN_STAY",
  ).length;
  const completedCount = displayReservations.filter(
    (r) => r.status === "CHECKED_OUT" || r.status === "COMPLETED" || r.status === "SETTLED",
  ).length;

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return displayReservations.filter((res) => {
      // Tab matching
      if (activeTab === "NEEDS_ACTION") {
        if (!(res.status === "CONFIRMED" || res.status === "INSPECTED" || res.status === "DISPUTED"))
          return false;
      } else if (activeTab === "ARRIVALS") {
        if (res.status !== "CONFIRMED") return false;
      } else if (activeTab === "IN_STAY") {
        if (!(res.status === "CHECKED_IN" || res.status === "IN_STAY")) return false;
      } else if (activeTab === "COMPLETED") {
        if (!(res.status === "CHECKED_OUT" || res.status === "COMPLETED" || res.status === "SETTLED"))
          return false;
      }

      // Search matching
      const matchSearch =
        searchQuery === "" ||
        res.property_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        res.unit_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        res.display_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        res.guest_code.toLowerCase().includes(searchQuery.toLowerCase());

      // Property matching
      const matchProperty =
        selectedProperty === "ALL" || res.property_title.includes(selectedProperty);

      // Status matching
      const matchStatus =
        selectedStatus === "ALL" || res.status === selectedStatus;

      return matchSearch && matchProperty && matchStatus;
    });
  }, [displayReservations, activeTab, searchQuery, selectedProperty, selectedStatus]);

  const handleCopyId = (id: string, displayId: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(displayId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="w-full pb-20 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-sm text-neutral-500 flex items-center gap-2">
          <Clock className="h-4 w-4 animate-spin text-neutral-400" />
          Loading guest reservations…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full pb-20 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error instanceof Error ? error.message : "Unable to load reservations."}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4.5rem)] bg-[#fafafa] pb-20 pt-6 sm:pt-8 text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* =========================================================================
            HEADER & HERO SECTION (MATCHING IMAGE 4)
            ========================================================================= */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f0ff] border border-[#e9d5ff] px-3.5 py-1 text-xs font-semibold text-[#7c3aed]">
              <CalendarCheck className="h-3.5 w-3.5" />
              <span>Bookings &amp; Check-ins</span>
            </div>
            <h1 className="mt-2.5 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
              Guest Reservations
            </h1>
            <p className="mt-1 text-sm sm:text-base text-neutral-500">
              Manage guest bookings, verify check-ins, conduct inspections, and allocate rooms — all in one place.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <Link
              href="/stays/home"
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-800 shadow-xs hover:border-neutral-400 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 text-neutral-600" />
              <span>Host Dashboard</span>
            </Link>

            <Link
              href="/stays/properties"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Manage Properties</span>
            </Link>
          </div>
        </div>

        {/* =========================================================================
            5 STAT METRIC CARDS ROW (MATCHING IMAGE 4)
            ========================================================================= */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Total Bookings */}
          <button
            type="button"
            onClick={() => setActiveTab("ALL")}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs text-left transition-all hover:shadow-md ${
              activeTab === "ALL" ? "border-indigo-400 ring-2 ring-indigo-100" : "border-neutral-200/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400">
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-neutral-500">Total Bookings</div>
            <div className="text-2xl font-black text-neutral-900">{totalCount}</div>
            <div className="text-[11px] text-neutral-400">All time reservations</div>
          </button>

          {/* Card 2: Needs Action */}
          <button
            type="button"
            onClick={() => setActiveTab("NEEDS_ACTION")}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs text-left transition-all hover:shadow-md ${
              activeTab === "NEEDS_ACTION" ? "border-orange-400 ring-2 ring-orange-100" : "border-neutral-200/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400">
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-neutral-500">Needs Action</div>
            <div className="text-2xl font-black text-orange-600">{needsActionCount}</div>
            <div className="text-[11px] text-neutral-400">Require your attention</div>
          </button>

          {/* Card 3: Arrivals Due */}
          <button
            type="button"
            onClick={() => setActiveTab("ARRIVALS")}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs text-left transition-all hover:shadow-md ${
              activeTab === "ARRIVALS" ? "border-emerald-400 ring-2 ring-emerald-100" : "border-neutral-200/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Plane className="h-4 w-4 rotate-45" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400">
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-neutral-500">Arrivals Due</div>
            <div className="text-2xl font-black text-neutral-900">{arrivalsCount}</div>
            <div className="text-[11px] text-neutral-400">Today / Upcoming</div>
          </button>

          {/* Card 4: In-Stay Guests */}
          <button
            type="button"
            onClick={() => setActiveTab("IN_STAY")}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs text-left transition-all hover:shadow-md ${
              activeTab === "IN_STAY" ? "border-blue-400 ring-2 ring-blue-100" : "border-neutral-200/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Users className="h-4 w-4" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400">
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-neutral-500">In-Stay Guests</div>
            <div className="text-2xl font-black text-neutral-900">{inStayCount}</div>
            <div className="text-[11px] text-neutral-400">Currently checked in</div>
          </button>

          {/* Card 5: Completed */}
          <button
            type="button"
            onClick={() => setActiveTab("COMPLETED")}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs text-left transition-all hover:shadow-md ${
              activeTab === "COMPLETED" ? "border-emerald-400 ring-2 ring-emerald-100" : "border-neutral-200/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400">
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-neutral-500">Completed</div>
            <div className="text-2xl font-black text-neutral-900">{completedCount}</div>
            <div className="text-[11px] text-neutral-400">Checked out &amp; past</div>
          </button>
        </div>

        {/* =========================================================================
            TABS BAR (MATCHING IMAGE 4)
            ========================================================================= */}
        <div className="mt-6 flex border-b border-neutral-200 text-xs font-bold gap-8 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("ALL")}
            className={`pb-3 transition-colors shrink-0 ${
              activeTab === "ALL"
                ? "border-b-2 border-indigo-600 text-indigo-700 font-black"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            All Bookings ({totalCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("NEEDS_ACTION")}
            className={`pb-3 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "NEEDS_ACTION"
                ? "border-b-2 border-orange-500 text-orange-700 font-black"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <span>Needs Action</span>
            <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.2 text-[10px] font-black">
              {needsActionCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ARRIVALS")}
            className={`pb-3 transition-colors shrink-0 ${
              activeTab === "ARRIVALS"
                ? "border-b-2 border-indigo-600 text-indigo-700 font-black"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            Arrivals Due ({arrivalsCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("IN_STAY")}
            className={`pb-3 transition-colors shrink-0 ${
              activeTab === "IN_STAY"
                ? "border-b-2 border-indigo-600 text-indigo-700 font-black"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            In-Stay ({inStayCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("COMPLETED")}
            className={`pb-3 transition-colors shrink-0 ${
              activeTab === "COMPLETED"
                ? "border-b-2 border-indigo-600 text-indigo-700 font-black"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            Completed &amp; Past
          </button>
        </div>

        {/* =========================================================================
            SEARCH & FILTER CONTROL BAR (MATCHING IMAGE 4)
            ========================================================================= */}
        <div className="mt-5 rounded-2xl border border-neutral-200/70 bg-white p-3 shadow-xs flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[260px] flex items-center">
            <Search className="h-4 w-4 text-neutral-400 ml-2.5 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search by guest name, property, booking ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none bg-transparent"
            />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Filter 1: All Properties */}
          <div className="relative min-w-[140px]">
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer py-1"
            >
              <option value="ALL">All Properties</option>
              <option value="Zolo">Zolo Stay Co-Living</option>
              <option value="Urban Nest">Urban Nest Studio</option>
              <option value="Independent House">Independent House</option>
            </select>
            <ChevronDown className="pointer-events-none absolute top-2 right-0 h-3.5 w-3.5 text-neutral-400" />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Filter 2: All Statuses */}
          <div className="relative min-w-[120px]">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer py-1"
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">In-Stay</option>
              <option value="INSPECTED">Inspected</option>
              <option value="CHECKED_OUT">Checked Out</option>
            </select>
            <ChevronDown className="pointer-events-none absolute top-2 right-0 h-3.5 w-3.5 text-neutral-400" />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Filter 3: Select Date Range */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 text-neutral-500" />
            <span>Select Date Range</span>
          </button>

          <div className="h-6 w-px bg-neutral-200 hidden md:block" />

          {/* Filter 4: Sort by */}
          <div className="relative min-w-[130px] ml-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-400">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-transparent pr-5 text-xs font-bold text-neutral-800 focus:outline-none cursor-pointer"
              >
                <option value="RECENT">Recent First</option>
                <option value="AMOUNT">Highest Amount</option>
                <option value="ARRIVAL">Arrival Date</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1 right-0 h-3.5 w-3.5 text-neutral-400" />
            </div>
          </div>
        </div>

        {/* =========================================================================
            BOOKING CARDS LIST (MATCHING IMAGE 4)
            ========================================================================= */}
        <div className="mt-5 space-y-4">
          {filteredReservations.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-12 text-center">
              <CalendarCheck className="mx-auto h-12 w-12 text-neutral-300" />
              <h3 className="mt-4 text-base font-bold text-neutral-900">No reservations found</h3>
              <p className="mt-1 text-xs text-neutral-400">
                No guest bookings match the selected criteria.
              </p>
            </div>
          ) : (
            filteredReservations.map((res) => (
              <div
                key={res.id}
                className="group rounded-2xl border border-neutral-200/70 bg-white p-4 sm:p-5 shadow-xs hover:border-neutral-300 hover:shadow-md transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
              >
                {/* Left: Thumbnail & Details (Clickable to open Guest Drawer) */}
                <div
                  onClick={() => setDrawerReservation(res)}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1 min-w-0 cursor-pointer"
                  title="Click to view detailed guest & reservation breakdown"
                >
                  {/* Thumbnail Photo */}
                  <div className="relative h-20 w-32 sm:h-22 sm:w-36 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    <img
                      src={res.image_url}
                      alt={res.property_title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>

                  {/* Booking Info */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: Title + Unit + Status Badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-extrabold text-neutral-900 truncate group-hover:text-indigo-600 transition-colors">
                        {res.property_title}
                      </h3>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                        {res.unit_code}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          res.status === "INSPECTED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : res.status === "CONFIRMED"
                            ? "bg-blue-50 text-blue-700 border border-blue-200/60"
                            : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                        }`}
                      >
                        {res.status_display}
                      </span>
                    </div>

                    {/* Locality */}
                    <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                      <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                      <span>{res.locality}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Booking ID + Actions */}
                <div className="flex flex-col items-start sm:items-end justify-between gap-2.5 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-100 shrink-0">
                  {/* Top: Booking ID + Copy + Menu */}
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span>Booking ID: {res.display_id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(res.id, res.display_id)}
                      className="text-neutral-400 hover:text-neutral-700 transition-colors p-0.5"
                      title="Copy Booking ID"
                    >
                      {copiedId === res.display_id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="text-neutral-400 hover:text-neutral-700 transition-colors p-0.5 ml-1"
                      title="More Options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-end">
                    {/* View Details Button (Always visible on all cards) */}
                    <button
                      type="button"
                      onClick={() => setDrawerReservation(res)}
                      className="rounded-xl border border-neutral-200/80 bg-white px-3.5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <FileText className="h-3.5 w-3.5 text-neutral-400" />
                      <span>View Details</span>
                    </button>

                    {res.status === "INSPECTED" ? (
                      <button
                        type="button"
                        onClick={() => setCheckInReservation(toPartnerItem(res, allRes))}
                        className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        Mark as Arrived
                      </button>
                    ) : res.status === "IN_STAY" || res.status === "CHECKED_IN" ? (
                      <button
                        type="button"
                        onClick={() => setCheckOutReservation(toPartnerItem(res, allRes))}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Inspect &amp; Check Out</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setReassignReservation(toPartnerItem(res, allRes))}
                          className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
                        >
                          Reassign Room
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckInReservation(toPartnerItem(res, allRes))}
                          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                        >
                          <DoorOpen className="h-4 w-4" />
                          <span>Check In Guest</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* =========================================================================
            BOTTOM PAGINATION BAR (MATCHING IMAGE 4)
            ========================================================================= */}
        <div className="mt-8 flex items-center justify-between text-xs text-neutral-400">
          <div>Showing {filteredReservations.length} bookings</div>
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

      {/* Slide-over Guest Details & Reservation Drawer */}
      {drawerReservation && (
        <GuestDetailsDrawer
          reservation={drawerReservation}
          onClose={() => setDrawerReservation(null)}
          onCheckIn={() => {
            const item = toPartnerItem(drawerReservation, allRes);
            setDrawerReservation(null);
            setCheckInReservation(item);
          }}
          onCheckOut={() => {
            const item = toPartnerItem(drawerReservation, allRes);
            setDrawerReservation(null);
            setCheckOutReservation(item);
          }}
          onReassign={() => {
            const item = toPartnerItem(drawerReservation, allRes);
            setDrawerReservation(null);
            setReassignReservation(item);
          }}
        />
      )}

      {/* =========================================================================
          OPERATIONAL MODALS
          ========================================================================= */}
      {/* Reassign Room Modal */}
      {reassignReservation && (
        <ReassignModal
          reservation={reassignReservation}
          onClose={() => setReassignReservation(null)}
        />
      )}

      {/* Check-In Modal */}
      {checkInReservation && (
        <CheckInModal
          reservation={checkInReservation}
          onClose={() => setCheckInReservation(null)}
        />
      )}

      {/* Check-Out Modal */}
      {checkOutReservation && (
        <CheckOutModal
          reservation={checkOutReservation}
          onClose={() => setCheckOutReservation(null)}
        />
      )}

      {/* New Booking Modal */}
    </div>
  );
}

/* =========================================================================
   CHECK-IN MODAL
   ========================================================================= */
function CheckInModal({
  reservation,
  onClose,
}: {
  reservation: PartnerReservationItem;
  onClose: () => void;
}) {
  const checkInMutation = usePartnerCheckIn();
  const [docType, setDocType] = useState<"AADHAAR" | "PAN" | "PASSPORT" | "DRIVING_LICENSE">("AADHAAR");
  const [docNumber, setDocNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAddPhoto = () => {
    const trimmed = photoUrlInput.trim();
    if (trimmed && !photoUrls.includes(trimmed)) {
      setPhotoUrls([...photoUrls, trimmed]);
      setPhotoUrlInput("");
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      await checkInMutation.mutateAsync({
        reservationId: reservation.id,
        id_document_type: docType,
        id_document_number: docNumber,
        guest_notes: notes,
        condition_photo_urls: photoUrls,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to record check-in.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-neutral-900">Guest Arrival &amp; Check-In</h3>
            <p className="text-xs text-neutral-500">
              Verify guest identification for {reservation.property_title} ({reservation.unit_code})
            </p>
            {/* Guest preview pill */}
            <div className="mt-2 text-xs font-bold text-neutral-900 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200/70 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-indigo-600" />
              <span>Guest: <strong>{reservation.guest_name || "Arriving Guest"}</strong> • {reservation.guest_phone || "Contact on file"}</span>
            </div>
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
            <label className="block text-xs font-bold text-neutral-700">Govt ID Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-800 focus:border-indigo-500 focus:outline-none"
            >
              <option value="AADHAAR">Aadhaar Card</option>
              <option value="PAN">PAN Card</option>
              <option value="PASSPORT">Passport</option>
              <option value="DRIVING_LICENSE">Driving License</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">ID Document Number (Masked)</label>
            <input
              type="text"
              required
              placeholder="e.g. XXXX-XXXX-4821"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Photo Evidence Section */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-indigo-600" />
                <span>Guest ID Photo &amp; Handover Evidence</span>
              </span>
              <span className="text-[10px] font-normal text-neutral-400">Optional</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="url"
                placeholder="Paste photo evidence URL or click a preset..."
                value={photoUrlInput}
                onChange={(e) => setPhotoUrlInput(e.target.value)}
                className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddPhoto}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
              >
                Add Photo
              </button>
            </div>

            {/* Quick Demo Photo Presets */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const url = "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=600&auto=format&fit=crop&q=80";
                  if (!photoUrls.includes(url)) setPhotoUrls([...photoUrls, url]);
                }}
                className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200/50"
              >
                + Aadhaar Card Scan
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600&auto=format&fit=crop&q=80";
                  if (!photoUrls.includes(url)) setPhotoUrls([...photoUrls, url]);
                }}
                className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200/50"
              >
                + Key Handover Proof
              </button>
            </div>

            {/* Uploaded Photos Thumbnails */}
            {photoUrls.length > 0 && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {photoUrls.map((url, idx) => (
                  <div key={idx} className="relative group h-14 w-14 rounded-lg overflow-hidden border border-neutral-200 shadow-2xs">
                    <img src={url} alt="Evidence" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Host Handover Notes (Optional)</label>
            <textarea
              rows={2}
              placeholder="Key handover, room orientation, luggage details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-3 text-xs text-indigo-900 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              By confirming check-in, guest occupancy begins. Security deposit remains securely held on file until check-out inspection.
            </span>
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
              disabled={checkInMutation.isPending}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {checkInMutation.isPending ? "Recording Check-In…" : "Confirm Guest Check-In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   CHECK-OUT MODAL
   ========================================================================= */
function CheckOutModal({
  reservation,
  onClose,
}: {
  reservation: PartnerReservationItem;
  onClose: () => void;
}) {
  const checkOutMutation = usePartnerCheckOut();
  const [conditionGrade, setConditionGrade] = useState<
    "EXCELLENT" | "GOOD" | "MINOR_DAMAGE" | "MAJOR_DAMAGE"
  >("EXCELLENT");
  const [damageFound, setDamageFound] = useState(false);
  const [damageEstimateRupees, setDamageEstimateRupees] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAddPhoto = () => {
    const trimmed = photoUrlInput.trim();
    if (trimmed && !photoUrls.includes(trimmed)) {
      setPhotoUrls([...photoUrls, trimmed]);
      setPhotoUrlInput("");
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const estimatePaise = damageFound ? Math.round(parseFloat(damageEstimateRupees || "0") * 100) : 0;
    try {
      await checkOutMutation.mutateAsync({
        reservationId: reservation.id,
        condition_grade: conditionGrade,
        damage_found: damageFound,
        damage_estimate_paise: estimatePaise,
        inspection_notes: notes,
        condition_photo_urls: photoUrls,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to record check-out.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-neutral-900">Room Inspection &amp; Check-Out</h3>
            <p className="text-xs text-neutral-500">
              Inspect condition and close stay for {reservation.property_title} ({reservation.unit_code})
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
            <label className="block text-xs font-bold text-neutral-700">Room Condition Assessment</label>
            <select
              value={conditionGrade}
              onChange={(e) => setConditionGrade(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-800 focus:border-indigo-500 focus:outline-none"
            >
              <option value="EXCELLENT">Clean &amp; Pristine (No issues)</option>
              <option value="GOOD">Normal Wear &amp; Tear (Standard turnover)</option>
              <option value="MINOR_DAMAGE">Minor Damage (Small repairs needed)</option>
              <option value="MAJOR_DAMAGE">Major Damage (Requires dispute/hold)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="damageFoundCheck"
              checked={damageFound}
              onChange={(e) => setDamageFound(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="damageFoundCheck" className="text-xs font-bold text-neutral-800">
              Report Physical Damage or Missing Items
            </label>
          </div>

          {damageFound && (
            <div>
              <label className="block text-xs font-bold text-neutral-700">Damage Estimate Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="e.g. 2500"
                value={damageEstimateRupees}
                onChange={(e) => setDamageEstimateRupees(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Amount to deduct from guest deposit (up to authorized limit).
              </p>
            </div>
          )}

          {/* Photo Evidence Section for Inspection */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-emerald-600" />
                <span>Move-Out Condition &amp; Damage Photo Evidence</span>
              </span>
              <span className="text-[10px] font-normal text-neutral-400">Optional</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="url"
                placeholder="Paste photo evidence URL..."
                value={photoUrlInput}
                onChange={(e) => setPhotoUrlInput(e.target.value)}
                className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddPhoto}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
              >
                Add Photo
              </button>
            </div>

            {/* Quick Demo Photo Presets */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const url = "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&auto=format&fit=crop&q=80";
                  if (!photoUrls.includes(url)) setPhotoUrls([...photoUrls, url]);
                }}
                className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200/50"
              >
                + Turnover Condition Photo
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&auto=format&fit=crop&q=80";
                  if (!photoUrls.includes(url)) setPhotoUrls([...photoUrls, url]);
                }}
                className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200/50"
              >
                + Meter / Keys Photo
              </button>
            </div>

            {/* Uploaded Photos Thumbnails */}
            {photoUrls.length > 0 && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {photoUrls.map((url, idx) => (
                  <div key={idx} className="relative group h-14 w-14 rounded-lg overflow-hidden border border-neutral-200 shadow-2xs">
                    <img src={url} alt="Evidence" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Inspection &amp; Handover Notes</label>
            <textarea
              rows={2}
              placeholder="Keys returned, meter readings, cleanliness check..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              disabled={checkOutMutation.isPending}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {checkOutMutation.isPending ? "Recording Inspection…" : "Complete Check-Out & Settle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   REASSIGN MODAL
   ========================================================================= */
function ReassignModal({
  reservation,
  onClose,
}: {
  reservation: PartnerReservationItem;
  onClose: () => void;
}) {
  const reassignMutation = usePartnerReassignUnit();
  const { data: units, isLoading: loadingUnits } = usePartnerPropertyUnits(
    reservation.property_id,
    reservation.unit_type_id,
  );
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const availableUnits = useMemo(() => {
    if (!units) return [];
    return units.filter(
      (u) => u.id !== reservation.unit_id && u.status === "ACTIVE",
    );
  }, [units, reservation.unit_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId) return;
    setSubmitError(null);
    try {
      await reassignMutation.mutateAsync({
        reservationId: reservation.id,
        target_unit_id: selectedUnitId,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to reassign unit.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-neutral-900">Reassign Room / Unit</h3>
            <p className="text-xs text-neutral-500">
              Move booking to an equivalent vacant {reservation.unit_name}
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
            <label className="block text-xs font-bold text-neutral-700">Current Assigned Unit</label>
            <div className="mt-1 rounded-xl bg-neutral-50 border border-neutral-200 p-2.5 text-xs font-black text-neutral-800">
              {reservation.unit_code} ({reservation.unit_name})
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Select Target Equivalent Unit</label>
            {loadingUnits ? (
              <div className="py-4 text-center text-xs text-neutral-400">Loading units…</div>
            ) : availableUnits.length === 0 ? (
              <div className="mt-1 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                No other equivalent vacant units available for this room configuration.
              </div>
            ) : (
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Choose Unit --</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_code} ({u.floor}) - {u.status}
                  </option>
                ))}
              </select>
            )}
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
              disabled={reassignMutation.isPending || !selectedUnitId}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {reassignMutation.isPending ? "Reassigning…" : "Confirm Reassignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   GUEST DETAILS & RESERVATION SLIDE-OVER DRAWER
   ========================================================================= */
function GuestDetailsDrawer({
  reservation,
  onClose,
  onCheckIn,
  onCheckOut,
  onReassign,
}: {
  reservation: DisplayReservation;
  onClose: () => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onReassign: () => void;
}) {
  const [copiedId, setCopiedId] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(reservation.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const cleanPhone = reservation.guest_phone.replace(/[^0-9]/g, "");
  const isAwaitingArrival = reservation.status === "CONFIRMED";
  const isInStay = reservation.status === "CHECKED_IN" || reservation.status === "IN_STAY";
  const isInspected = reservation.status === "INSPECTED";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-950/45 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-xl w-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300 border-l border-neutral-200">
        {/* Top Header */}
        <div className="border-b border-neutral-200/80 px-6 py-4 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                Stays Host Workspace
              </span>
              <span className="text-xs font-semibold text-neutral-400">
                Booking #{reservation.display_id}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Full Page Link */}
              <Link
                href={`/stays/reservations/${reservation.id}`}
                className="flex items-center gap-1 rounded-lg border border-neutral-200/80 px-2.5 py-1 text-xs font-bold text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                title="Open in Full Page"
              >
                <ExternalLink className="h-3.5 w-3.5 text-neutral-500" />
                <span>Full Page</span>
              </Link>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                title="Close Drawer (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-black text-neutral-900">
                {reservation.property_title}
              </h2>
              <div className="flex items-center gap-1 text-xs text-neutral-500 mt-0.5">
                <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span>{reservation.locality}</span>
                <span className="mx-1">•</span>
                <span className="font-bold text-neutral-700">{reservation.unit_code}</span>
              </div>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isInspected
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : isAwaitingArrival
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : isInStay
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  : "bg-neutral-100 text-neutral-700 border border-neutral-200"
              }`}
            >
              {reservation.status_display}
            </span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Card 1: Guest Identity & Direct Contact */}
          <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-b from-white to-neutral-50/50 p-5 shadow-xs">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-base font-black shadow-sm shrink-0">
                  {reservation.guest_name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-black text-neutral-900 flex items-center gap-2">
                    <span>{reservation.guest_name}</span>
                    {reservation.check_in?.id_verified && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 font-medium">
                    {reservation.guest_count} Registered Guest{reservation.guest_count > 1 ? "s" : ""} • Reference {reservation.guest_code}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 hover:text-neutral-700 transition-colors bg-neutral-100/70 hover:bg-neutral-200/60 px-2 py-1 rounded-lg"
                title="Copy Guest Reservation ID"
              >
                {copiedId ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>

            {/* Direct Quick Action Buttons */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <a
                href={`tel:${reservation.guest_phone}`}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 px-3 text-xs font-bold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-colors shadow-2xs"
              >
                <Phone className="h-3.5 w-3.5 text-indigo-600" />
                <span>Call Guest</span>
              </a>

              <a
                href={`https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(
                  reservation.guest_name,
                )},%20regarding%20your%20stay%20at%20${encodeURIComponent(
                  reservation.property_title,
                )}...`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 py-2 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>

              <a
                href={`mailto:${reservation.guest_email}?subject=Reservation%20Details%20-%20${encodeURIComponent(
                  reservation.property_title,
                )}`}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 px-3 text-xs font-bold text-neutral-800 hover:bg-neutral-50 transition-colors shadow-2xs"
              >
                <Mail className="h-3.5 w-3.5 text-neutral-500" />
                <span>Send Email</span>
              </a>
            </div>

            {/* Contact details display */}
            <div className="mt-3 pt-3 border-t border-neutral-200/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-neutral-600">
                <Phone className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span className="font-semibold text-neutral-900">{reservation.guest_phone}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-600 truncate">
                <Mail className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span className="font-semibold text-neutral-900 truncate">{reservation.guest_email}</span>
              </div>
            </div>
          </div>

          {/* Card 2: KYC & Government ID Verification */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                  Government ID &amp; KYC Record
                </h3>
              </div>
              {reservation.check_in?.id_verified ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  <Check className="h-3 w-3" />
                  Verified at Check-in
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                  <Clock className="h-3 w-3" />
                  Pending Arrival
                </span>
              )}
            </div>

            {reservation.check_in ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100">
                    <span className="text-[11px] font-bold text-neutral-400 block">ID Document Type</span>
                    <span className="text-xs font-black text-neutral-900 mt-0.5 block">
                      {reservation.check_in.id_document_type === "AADHAAR"
                        ? "Aadhaar Card"
                        : reservation.check_in.id_document_type === "PASSPORT"
                        ? "Passport"
                        : reservation.check_in.id_document_type === "DRIVING_LICENSE"
                        ? "Driving License"
                        : reservation.check_in.id_document_type || "Govt Photo ID"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100">
                    <span className="text-[11px] font-bold text-neutral-400 block">ID Document Number</span>
                    <span className="text-xs font-mono font-black text-neutral-900 mt-0.5 block">
                      {reservation.check_in.id_document_number
                        ? (reservation.check_in.id_document_number.length >= 8
                            ? `XXXX-XXXX-${reservation.check_in.id_document_number.slice(-4)}`
                            : reservation.check_in.id_document_number)
                        : "XXXX-XXXX-4821"}
                    </span>
                  </div>
                </div>

                {reservation.check_in.guest_notes && (
                  <div className="rounded-xl bg-neutral-50/70 p-3 border border-neutral-100 text-xs">
                    <span className="text-[11px] font-bold text-neutral-400 block">Host Handover Notes</span>
                    <p className="mt-1 text-xs text-neutral-700 font-medium leading-relaxed">
                      {reservation.check_in.guest_notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-amber-50/70 border border-amber-200/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">Physical ID Verification Required</span>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                    The guest must present a valid government-issued photo ID (Aadhaar, Passport, PAN, or Driving License) upon arrival. Verify the document and record the masked number during check-in.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Stay & Unit Allocation */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Building2 className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                Stay &amp; Room Details
              </h3>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100">
                <span className="text-[11px] font-bold text-neutral-400 block">Assigned Room / Unit</span>
                <span className="text-xs font-black text-neutral-900 mt-0.5 block">
                  {reservation.unit_code}
                </span>
                <span className="text-[11px] text-neutral-500 font-medium">{reservation.unit_name}</span>
              </div>

              <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100">
                <span className="text-[11px] font-bold text-neutral-400 block">Duration &amp; Mode</span>
                <span className="text-xs font-black text-neutral-900 mt-0.5 block">
                  {reservation.total_nights} Nights ({reservation.duration_mode})
                </span>
                <span className="text-[11px] text-neutral-500 font-medium">11-Month Periodic Lease</span>
              </div>

              <div className="col-span-2 rounded-xl bg-neutral-50 p-3 border border-neutral-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-neutral-400 block">Scheduled Stay Period</span>
                  <span className="text-xs font-black text-neutral-900 mt-0.5 block">
                    {reservation.start_date} → {reservation.end_date}
                  </span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-neutral-200 text-neutral-500">
                  <Calendar className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Financial & Security Deposit Breakdown */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                  Billing &amp; Deposit Summary
                </h3>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                Deposit {reservation.deposit_status}
              </span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 text-neutral-600">
                <span>Room Charges &amp; Rent</span>
                <span className="font-bold text-neutral-900">
                  {formatPaise(reservation.total_amount_paise - (reservation.deposit_paise || 0) * 0.2)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-600">
                <span>Maintenance &amp; High-Speed Wi-Fi</span>
                <span className="font-bold text-neutral-900">{formatPaise(200000)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-600">
                <span>One-Time Agreement &amp; Verification</span>
                <span className="font-bold text-neutral-900">{formatPaise(100000)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-neutral-600">
                <span>GST (Taxes)</span>
                <span className="font-bold text-neutral-900">{formatPaise(100000)}</span>
              </div>

              <div className="pt-2 border-t border-neutral-200/70 flex items-center justify-between text-sm">
                <span className="font-black text-neutral-900">Total Booking Value</span>
                <span className="font-black text-indigo-700 text-base">
                  {formatPaise(reservation.total_amount_paise)}
                </span>
              </div>

              <div className="rounded-xl bg-amber-50/60 p-3 border border-amber-200/60 flex items-center justify-between mt-2">
                <div>
                  <span className="text-[11px] font-bold text-amber-900 block">Security Deposit Held on File</span>
                  <span className="text-[11px] text-amber-700">Refundable post-checkout inspection</span>
                </div>
                <span className="text-xs font-black text-amber-900">
                  {formatPaise(reservation.deposit_paise)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 5: Departure Inspection (if inspected or completed) */}
          {reservation.check_out && (
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                    Departure Inspection Record
                  </h3>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  {reservation.check_out.condition_grade}
                </span>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 text-neutral-600">
                  <span>Damage Found</span>
                  <span className="font-bold text-neutral-900">
                    {reservation.check_out.damage_found ? "Damage Reported" : "None (Pristine)"}
                  </span>
                </div>
                {reservation.check_out.inspection_notes && (
                  <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100 text-neutral-700 mt-1 font-medium">
                    {reservation.check_out.inspection_notes}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Docked Sticky Action Footer */}
        <div className="border-t border-neutral-200/80 bg-white p-4 sticky bottom-0 z-10 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Close
          </button>

          {isAwaitingArrival && (
            <>
              <button
                type="button"
                onClick={onReassign}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Reassign Room
              </button>
              <button
                type="button"
                onClick={onCheckIn}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <DoorOpen className="h-4 w-4" />
                <span>Check In Guest</span>
              </button>
            </>
          )}

          {isInStay && (
            <button
              type="button"
              onClick={onCheckOut}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="h-4 w-4" />
              <span>Inspect &amp; Check Out</span>
            </button>
          )}

          {isInspected && (
            <button
              type="button"
              onClick={onCheckIn}
              className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              Mark as Arrived
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
