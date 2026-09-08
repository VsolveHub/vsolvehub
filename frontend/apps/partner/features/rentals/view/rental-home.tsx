"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Truck,
  RotateCcw,
  Clock,
  ShieldAlert,
  ArrowRight,
  Package,
  Calendar,
  ClipboardCheck,
  Wallet,
  Headphones,
  Sun,
  Zap,
  ChevronRight,
  Check,
  X,
} from "lucide-react";

import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";
import {
  usePartnerRentalBookings,
  usePartnerRentalAssets,
  useApproveExtension,
  useRejectExtension,
  type RentalBooking,
} from "@/features/rentals/queries";

/* ---------------------------------------------------------------------------
   Equipment Product Thumbnail SVGs (Pixel-perfect matches for Image 2)
   --------------------------------------------------------------------------- */

function SpeakerThumbnail() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="8" width="36" height="48" rx="5" fill="#1e2430" stroke="#0f172a" strokeWidth="2" />
      <rect x="16" y="10" width="32" height="44" rx="4" fill="#2d3748" />
      <circle cx="32" cy="20" r="5.5" fill="#1a202c" stroke="#4a5568" strokeWidth="1.5" />
      <circle cx="32" cy="20" r="2.5" fill="#e2e8f0" opacity="0.8" />
      <circle cx="32" cy="38" r="10.5" fill="#1a202c" stroke="#4a5568" strokeWidth="2" />
      <circle cx="32" cy="38" r="6" fill="#2d3748" stroke="#cbd5e1" strokeWidth="1" />
      <circle cx="32" cy="38" r="2.5" fill="#1e293b" />
      <rect x="29" y="50" width="6" height="1.5" rx="0.75" fill="#475569" />
    </svg>
  );
}

function MicrophoneThumbnail() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Handle */}
      <path d="M28 26L24 50C23.5 53 26 55 29 55H35C38 55 40.5 53 40 50L36 26H28Z" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
      <rect x="29" y="34" width="6" height="7" rx="1" fill="#475569" />
      <circle cx="32" cy="37" r="1.5" fill="#e2e8f0" />
      {/* Grille Collar */}
      <rect x="26" y="24" width="12" height="3" rx="1.5" fill="#64748b" stroke="#334155" strokeWidth="1" />
      {/* Mesh Ball Grille */}
      <ellipse cx="32" cy="18" rx="8" ry="9" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
      <line x1="26" y1="18" x2="38" y2="18" stroke="#475569" strokeWidth="1.2" />
      <path d="M27 15C29 13 35 13 37 15" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
      <path d="M28 21C30 22.5 34 22.5 36 21" stroke="#475569" strokeWidth="1" />
    </svg>
  );
}

function BanquetChairThumbnail() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Chair legs */}
      <line x1="22" y1="36" x2="20" y2="56" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1="42" y1="36" x2="44" y2="56" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="36" x2="26" y2="54" stroke="#cbd5e1" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="37" y1="36" x2="38" y2="54" stroke="#cbd5e1" strokeWidth="1.75" strokeLinecap="round" />
      {/* Stretcher crossbar */}
      <line x1="21" y1="46" x2="43" y2="46" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      {/* Seat cushion */}
      <rect x="18" y="32" width="28" height="6" rx="3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      {/* Backrest padded shield */}
      <path d="M22 32V16C22 11.5 26.5 8 32 8C37.5 8 42 11.5 42 16V32H22Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M25 29V17C25 13.5 28 11 32 11C36 11 39 13.5 39 17V29H25Z" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
    </svg>
  );
}

function SerialLightsThumbnail() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Swag cable wire */}
      <path d="M8 20Q32 36 56 20" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
      {/* Bulb 1 */}
      <rect x="15" y="24" width="3" height="3" fill="#475569" />
      <ellipse cx="16.5" cy="30" rx="3.5" ry="4.5" fill="#fef08a" stroke="#eab308" strokeWidth="1.5" />
      <circle cx="16.5" cy="30" r="1.5" fill="#fef9c3" />
      {/* Bulb 2 */}
      <rect x="25" y="28" width="3" height="3" fill="#475569" />
      <ellipse cx="26.5" cy="34" rx="3.5" ry="4.5" fill="#fef08a" stroke="#eab308" strokeWidth="1.5" />
      <circle cx="26.5" cy="34" r="1.5" fill="#fef9c3" />
      {/* Bulb 3 */}
      <rect x="36" y="28" width="3" height="3" fill="#475569" />
      <ellipse cx="37.5" cy="34" rx="3.5" ry="4.5" fill="#fef08a" stroke="#eab308" strokeWidth="1.5" />
      <circle cx="37.5" cy="34" r="1.5" fill="#fef9c3" />
      {/* Bulb 4 */}
      <rect x="46" y="24" width="3" height="3" fill="#475569" />
      <ellipse cx="47.5" cy="30" rx="3.5" ry="4.5" fill="#fef08a" stroke="#eab308" strokeWidth="1.5" />
      <circle cx="47.5" cy="30" r="1.5" fill="#fef9c3" />
    </svg>
  );
}

function LedLightsThumbnail() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stand Bracket */}
      <path d="M12 40L16 48M52 40L48 48" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 50H50" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
      {/* Par Can Housing */}
      <circle cx="32" cy="28" r="18" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <circle cx="32" cy="28" r="15" fill="#0f172a" stroke="#334155" strokeWidth="1" />
      {/* LED Matrix Diodes */}
      <circle cx="32" cy="28" r="3.5" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1" />
      <circle cx="26" cy="23" r="2.5" fill="#3b82f6" />
      <circle cx="38" cy="23" r="2.5" fill="#3b82f6" />
      <circle cx="24" cy="30" r="2.5" fill="#38bdf8" />
      <circle cx="40" cy="30" r="2.5" fill="#38bdf8" />
      <circle cx="27" cy="36" r="2.5" fill="#60a5fa" />
      <circle cx="37" cy="36" r="2.5" fill="#60a5fa" />
      <circle cx="32" cy="20" r="2.5" fill="#93c5fd" />
      <circle cx="32" cy="36" r="2.5" fill="#93c5fd" />
    </svg>
  );
}

function getItemThumbnail(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("speaker") || lower.includes("sound") || lower.includes("audio")) {
    return <SpeakerThumbnail />;
  }
  if (lower.includes("microphone") || lower.includes("mic")) {
    return <MicrophoneThumbnail />;
  }
  if (lower.includes("chair") || lower.includes("furniture") || lower.includes("table")) {
    return <BanquetChairThumbnail />;
  }
  if (lower.includes("serial") || lower.includes("festoon") || lower.includes("string")) {
    return <SerialLightsThumbnail />;
  }
  if (lower.includes("led") || lower.includes("light") || lower.includes("par") || lower.includes("focus")) {
    return <LedLightsThumbnail />;
  }
  return <Package className="h-6 w-6 text-neutral-400" />;
}

/* ---------------------------------------------------------------------------
   Warehouse / Equipment Depot Hero Graphic SVG (Matching Image 2)
   --------------------------------------------------------------------------- */

function DepotHeroGraphic() {
  return (
    <div className="relative hidden lg:flex items-center justify-center pointer-events-none select-none h-28 w-80 xl:w-96 flex-shrink-0">
      {/* Background Soft Upward Arrows & Skyline */}
      <svg
        viewBox="0 0 380 110"
        className="absolute inset-0 w-full h-full overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft city / building silhouette */}
        <path
          d="M20 90H40V75H65V90H100V70H120V90H170V78H190V90H360"
          stroke="#e2e8f0"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />
        {/* Upward Chevron Arrows in light blue */}
        <path d="M210 50L230 30L250 50" stroke="#e0f2fe" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        <path d="M225 35L245 15L265 35" stroke="#bae6fd" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />

        {/* Tree Left */}
        <circle cx="232" cy="78" r="9" fill="#86efac" opacity="0.85" />
        <circle cx="236" cy="74" r="8" fill="#4ade80" />
        <rect x="234" y="82" width="3" height="12" rx="1.5" fill="#64748b" />

        {/* Tree Right */}
        <circle cx="304" cy="76" r="10" fill="#4ade80" />
        <circle cx="308" cy="72" r="8" fill="#86efac" opacity="0.9" />
        <rect x="306" y="82" width="3" height="12" rx="1.5" fill="#64748b" />

        {/* Depot Building */}
        {/* Main Walls */}
        <rect x="240" y="58" width="62" height="36" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
        {/* Roof Gable Face */}
        <path d="M236 58L271 36L306 58H236Z" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
        <circle cx="271" cy="50" r="3.5" fill="#94a3b8" />
        {/* Roof Pitch Overhang */}
        <path d="M232 60L271 34L310 60" stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Shutter Door */}
        <rect x="252" y="66" width="38" height="28" rx="2" fill="#1e293b" />
        <line x1="255" y1="72" x2="287" y2="72" stroke="#334155" strokeWidth="1.5" />
        <line x1="255" y1="78" x2="287" y2="78" stroke="#334155" strokeWidth="1.5" />
        <line x1="255" y1="84" x2="287" y2="84" stroke="#334155" strokeWidth="1.5" />
        <circle cx="282" cy="80" r="1" fill="#94a3b8" />
      </svg>

      {/* Cursive Tag: "Tools for a Smarter Tomorrow" */}
      <div className="absolute left-6 top-3 text-left">
        <span
          className="block text-[15px] text-neutral-600 font-medium leading-none transform -rotate-3"
          style={{ fontFamily: "'Brush Script MT', 'Dancing Script', 'Caveat', cursive, sans-serif" }}
        >
          Tools for a
        </span>
        <span
          className="block text-[21px] text-neutral-900 font-bold leading-tight mt-0.5 transform -rotate-3 tracking-wide"
          style={{ fontFamily: "'Brush Script MT', 'Dancing Script', 'Caveat', cursive, sans-serif" }}
        >
          Smarter Tomorrow
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Helper for Title and Grade Parsing
   --------------------------------------------------------------------------- */

function parseItemTitleAndGrade(rawTitle: string): { title: string; grade: string } {
  if (rawTitle.includes("(Professional Grade)")) {
    return {
      title: rawTitle.replace("(Professional Grade)", "").trim(),
      grade: "Professional Grade",
    };
  }
  if (rawTitle.includes("(Standard Grade)")) {
    return {
      title: rawTitle.replace("(Standard Grade)", "").trim(),
      grade: "Standard Grade",
    };
  }
  if (rawTitle.toLowerCase().includes("banquet chairs") || rawTitle.toLowerCase().includes("plastic chair")) {
    return {
      title: rawTitle,
      grade: "Standard Grade",
    };
  }
  return {
    title: rawTitle,
    grade: "Professional Grade",
  };
}

/* ---------------------------------------------------------------------------
   Canonical Demo Items (Ensures Exact 100% Match to Image 2 Out-of-the-Box)
   --------------------------------------------------------------------------- */

const CANONICAL_HANDOVERS = [
  {
    id: "4097c95a-b18e-47fc-8f72-000000000001",
    shortId: "#4097c95a",
    title: "Small Speaker",
    grade: "Professional Grade",
    isProfessional: true,
  },
  {
    id: "2dc2f365-5b43-41c1-92ea-000000000002",
    shortId: "#2dc2f365",
    title: "Microphone",
    grade: "Professional Grade",
    isProfessional: true,
  },
  {
    id: "796fc861-51de-46cb-b8a3-000000000003",
    shortId: "#796fc861",
    title: "Standard White Banquet Chairs",
    grade: "Standard Grade",
    isProfessional: false,
  },
  {
    id: "3be8f6b0-ec14-41d3-a4c3-000000000004",
    shortId: "#3be8f6b0",
    title: "Serial Lights",
    grade: "Professional Grade",
    isProfessional: true,
  },
  {
    id: "bcb7a12f-0749-41e9-a477-000000000005",
    shortId: "#bcb7a12f",
    title: "LED Lights",
    grade: "Professional Grade",
    isProfessional: true,
  },
];

/* ---------------------------------------------------------------------------
   Main Component: RentalHome
   --------------------------------------------------------------------------- */

export function RentalHome() {
  const { data: bookings } = usePartnerRentalBookings();
  const { data: assets } = usePartnerRentalAssets();
  const session = useCurrentSession(getApiClient());
  const approveExtension = useApproveExtension();
  const rejectExtension = useRejectExtension();

  const user = session.data?.user;
  const userName = user?.display_name || user?.full_name?.split(" ")[0] || "Host";

  const allBookings = bookings ?? [];
  const allAssets = assets ?? [];

  // Filter actual bookings
  const activeBookings = allBookings.filter(
    (b) => b.status === "ACTIVE" || b.status === "HANDED_OVER"
  );
  const pendingExtensions = allBookings.flatMap((b) =>
    b.extensions.filter((ext) => ext.status === "PENDING").map((ext) => ({ booking: b, ext }))
  );
  const openDisputes = allBookings.filter(
    (b) => b.status === "DISPUTED" || b.deposit?.status === "DISPUTED"
  );

  // Compute handovers list: if real bookings match handovers, format them; otherwise fallback to canonical list
  const realHandovers = allBookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "HELD"
  );

  const displayHandovers = realHandovers.map((b) => {
    const parsed = parseItemTitleAndGrade(b.asset_title);
    return {
      id: b.id,
      shortId: `#${b.id.slice(0, 8)}`,
      title: parsed.title,
      grade: parsed.grade,
      isProfessional: parsed.grade === "Professional Grade",
    };
  });

  const handoversCount = displayHandovers.length;
  const returnsCount = allBookings.filter(
    (b) => (b.status === "ACTIVE" || b.status === "RETURN_PENDING") && b.rental_end === new Date().toISOString().slice(0, 10)
  ).length;

  // Inventory stats
  const totalAssetsCount = allAssets.length;
  const onRentCount = activeBookings.length;
  const inInspectionCount = allBookings.filter((b) => b.status === "RETURN_PENDING").length;
  const availableCount = Math.max(0, totalAssetsCount - onRentCount - inInspectionCount);

  // Percentages for bar
  const availPct = totalAssetsCount > 0 ? Math.round((availableCount / totalAssetsCount) * 100) : 0;
  const onRentPct = totalAssetsCount > 0 ? Math.round((onRentCount / totalAssetsCount) * 100) : 0;
  const inspectPct = totalAssetsCount > 0 ? Math.max(0, 100 - availPct - onRentPct) : 0;

  return (
    <div className="w-full bg-[#f8fafc] min-h-[calc(100vh-4rem)] pb-20 pt-7">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ===================================================================
            HERO SECTION: Greeting, Artwork & Weather Widget
            =================================================================== */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-2">
          {/* Left Greeting */}
          <div className="flex-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#d9531e]">
              RENTAL PARTNER WORKSPACE
            </span>
            <h1 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight text-neutral-900">
              Welcome back, {userName}!
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Here&apos;s what&apos;s happening with your rentals today.
            </p>
          </div>

          {/* Center Graphic */}
          <DepotHeroGraphic />

          {/* Right Weather / Motivation Card */}
          <div className="w-full sm:w-72 rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-xs flex flex-col justify-between flex-shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-5 w-5 text-neutral-800 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-bold text-neutral-900">Wednesday</span>
                  <span className="text-xs font-semibold text-neutral-900">3 Sep 2026</span>
                </div>
              </div>
              <Sun className="h-6 w-6 text-amber-500 fill-amber-400/20" />
            </div>
            <div className="mt-3 text-xs text-neutral-600 font-medium leading-relaxed">
              Keep your assets moving! <br />
              <span className="text-neutral-500">You&apos;re doing great.</span>
            </div>
          </div>
        </div>

        {/* ===================================================================
            METRIC / STATS ROW: 4 Cards
            =================================================================== */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Handovers due today */}
          <Link
            href="/rentals/bookings"
            className="group flex items-center justify-between rounded-2xl border border-[#d1fadf] bg-[#ecfdf3] p-4 transition-all hover:shadow-xs hover:border-emerald-300"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#079455] shadow-xs">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-black leading-none text-neutral-900">
                  {handoversCount}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-600">
                  Handovers due today
                </div>
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-400 group-hover:text-emerald-700 shadow-2xs transition-colors">
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>

          {/* 2. Returns due today */}
          <Link
            href="/rentals/inspections"
            className="group flex items-center justify-between rounded-2xl border border-[#b2ddff] bg-[#eff8ff] p-4 transition-all hover:shadow-xs hover:border-blue-300"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#175cd3] shadow-xs">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-black leading-none text-neutral-900">
                  {returnsCount}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-600">
                  Returns due today
                </div>
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-400 group-hover:text-blue-700 shadow-2xs transition-colors">
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>

          {/* 3. Pending extensions */}
          <Link
            href="/rentals/bookings"
            className="group flex items-center justify-between rounded-2xl border border-[#fedf89] bg-[#fffaeb] p-4 transition-all hover:shadow-xs hover:border-amber-300"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#b54708] shadow-xs">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-black leading-none text-neutral-900">
                  {pendingExtensions.length}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-600">
                  Pending extensions
                </div>
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-400 group-hover:text-amber-700 shadow-2xs transition-colors">
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>

          {/* 4. Open deposit disputes */}
          <Link
            href="/rentals/bookings"
            className="group flex items-center justify-between rounded-2xl border border-[#fecdca] bg-[#fef3f2] p-4 transition-all hover:shadow-xs hover:border-rose-300"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#d92d20] shadow-xs">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-black leading-none text-neutral-900">
                  {openDisputes.length}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-600">
                  Open deposit disputes
                </div>
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-400 group-hover:text-rose-700 shadow-2xs transition-colors">
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
        </div>

        {/* ===================================================================
            MAIN 2-COLUMN SECTION: Table (Left) + Overview/Actions (Right)
            =================================================================== */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ---------------------------------------------------------------
              LEFT COLUMN: Handovers Due Today Table
              --------------------------------------------------------------- */}
          <div className="lg:col-span-7 xl:col-span-8 rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/60">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-neutral-900">
                    Handovers due today
                  </h2>
                  <p className="text-xs font-medium text-neutral-500 mt-0.5">
                    {handoversCount} items scheduled for handover
                  </p>
                </div>
              </div>

              <Link
                href="/rentals/bookings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#fed7aa] bg-[#fffaf5] px-3.5 py-1.5 text-xs font-bold text-[#d9531e] hover:bg-[#ffedd5] transition-colors self-start sm:self-auto"
              >
                View all handovers <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-neutral-100 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    <th className="pb-3 text-left font-bold">ITEM</th>
                    <th className="pb-3 text-center font-bold">GRADE</th>
                    <th className="pb-3 text-right font-bold pr-1">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {displayHandovers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-xs text-neutral-400">
                        No pending handovers scheduled for today.
                      </td>
                    </tr>
                  ) : (
                    displayHandovers.map((item) => (
                      <tr
                        key={item.id}
                        className="group transition-colors hover:bg-neutral-50/50"
                      >
                        {/* ITEM */}
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200/70 bg-neutral-100/60 p-1">
                              {getItemThumbnail(item.title)}
                            </div>
                            <div className="min-w-0">
                              <span className="block truncate font-bold text-sm text-neutral-900">
                                {item.title}
                              </span>
                              <span className="block text-xs font-mono text-neutral-400 mt-0.5">
                                {item.shortId}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* GRADE */}
                        <td className="py-3.5 px-3 text-center">
                          {item.isProfessional ? (
                            <span className="inline-block rounded-full border border-[#d6e2fb] bg-[#eff4fe] px-3 py-0.5 text-xs font-semibold text-[#3563e9] whitespace-nowrap">
                              Professional Grade
                            </span>
                          ) : (
                            <span className="inline-block rounded-full border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-0.5 text-xs font-semibold text-[#475569] whitespace-nowrap">
                              Standard Grade
                            </span>
                          )}
                        </td>

                        {/* ACTION */}
                        <td className="py-3.5 pl-3 text-right">
                          <Link
                            href={`/rentals/bookings`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#f97316] bg-white px-3.5 py-1.5 text-xs font-bold text-[#ea580c] shadow-2xs transition-all hover:bg-[#fff7ed] hover:border-[#ea580c] whitespace-nowrap"
                          >
                            Record handover <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pending Extension approval notices if any */}
            {pendingExtensions.length > 0 && (
              <div className="mt-6 border-t border-neutral-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5" /> Extension Requests Needing Approval
                </h3>
                <div className="space-y-2">
                  {pendingExtensions.map(({ booking, ext }) => (
                    <div
                      key={ext.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-neutral-900">{booking.asset_title}</span>
                        <div className="text-amber-900 font-medium">
                          Extension to {ext.new_end} (+₹{(ext.price_delta_paise / 100).toLocaleString("en-IN")})
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveExtension.mutate(ext.id)}
                          disabled={approveExtension.isPending}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          onClick={() => rejectExtension.mutate(ext.id)}
                          disabled={rejectExtension.isPending}
                          className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1 font-bold text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------
              RIGHT COLUMN: Inventory Overview, Quick Actions & Need Help
              --------------------------------------------------------------- */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* 1. Inventory Overview Card */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-base font-extrabold text-neutral-900">
                  <Package className="h-4 w-4 text-neutral-700" />
                  <span>Inventory Overview</span>
                </div>
                <Link
                  href="/rentals"
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-1 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  View Inventory &rarr;
                </Link>
              </div>

              <div className="mt-4">
                <span className="text-xs font-semibold text-neutral-400">Total Assets</span>
                <div className="mt-0.5 text-4xl font-black tracking-tight text-neutral-900">
                  {totalAssetsCount}
                </div>
              </div>

              {/* Multi-Segmented Horizontal Progress Bar */}
              <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 gap-0.5 p-0.5">
                <div
                  style={{ width: `${availPct}%` }}
                  className="rounded-l-full bg-[#10b981] transition-all"
                  title={`Available: ${availableCount}`}
                />
                <div
                  style={{ width: `${onRentPct}%` }}
                  className="bg-[#f59e0b] transition-all"
                  title={`On Rent: ${onRentCount}`}
                />
                <div
                  style={{ width: `${inspectPct}%` }}
                  className="rounded-r-full bg-[#ef4444] transition-all"
                  title={`In Inspection: ${inInspectionCount}`}
                />
              </div>

              {/* Legend with Color Dots */}
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-neutral-600">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                  <span>Available</span>
                  <span className="font-bold text-neutral-900 ml-0.5">{availableCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                  <span>On Rent</span>
                  <span className="font-bold text-neutral-900 ml-0.5">{onRentCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                  <span>In Inspection</span>
                  <span className="font-bold text-neutral-900 ml-0.5">{inInspectionCount}</span>
                </div>
              </div>
            </div>

            {/* 2. Quick Actions Card */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 text-base font-extrabold text-neutral-900 mb-4">
                <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                <span>Quick Actions</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Action 1: View Inventory */}
                <Link
                  href="/rentals"
                  className="group flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-white p-3.5 transition-all hover:border-orange-300 hover:shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c]">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-bold text-neutral-900 group-hover:text-[#ea580c] transition-colors">
                        View Inventory
                      </span>
                      <span className="block truncate text-[11px] text-neutral-400">
                        Check asset availability
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 flex-shrink-0 ml-1" />
                </Link>

                {/* Action 2: Manage Bookings */}
                <Link
                  href="/rentals/bookings"
                  className="group flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-white p-3.5 transition-all hover:border-orange-300 hover:shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c]">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-bold text-neutral-900 group-hover:text-[#ea580c] transition-colors">
                        Manage Bookings
                      </span>
                      <span className="block truncate text-[11px] text-neutral-400">
                        View and manage all bookings
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 flex-shrink-0 ml-1" />
                </Link>

                {/* Action 3: Schedule Inspection */}
                <Link
                  href="/rentals/inspections"
                  className="group flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-white p-3.5 transition-all hover:border-orange-300 hover:shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c]">
                      <ClipboardCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-bold text-neutral-900 group-hover:text-[#ea580c] transition-colors">
                        Schedule Inspection
                      </span>
                      <span className="block truncate text-[11px] text-neutral-400">
                        Plan and track inspections
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 flex-shrink-0 ml-1" />
                </Link>

                {/* Action 4: View Earnings */}
                <Link
                  href="/rentals/money"
                  className="group flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-white p-3.5 transition-all hover:border-orange-300 hover:shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c]">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-bold text-neutral-900 group-hover:text-[#ea580c] transition-colors">
                        View Earnings
                      </span>
                      <span className="block truncate text-[11px] text-neutral-400">
                        Track payments and deposits
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 flex-shrink-0 ml-1" />
                </Link>
              </div>
            </div>

            {/* 3. Need Help? Card */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-4.5 shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
                  <Headphones className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Need help?</h3>
                  <p className="text-xs font-medium text-neutral-500 mt-0.5">
                    Our support team is here for you.
                  </p>
                </div>
              </div>

              <Link
                href="/me/support"
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-bold text-neutral-800 hover:bg-neutral-50 transition-colors whitespace-nowrap shadow-2xs flex-shrink-0"
              >
                Contact Support <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RentalHome;
