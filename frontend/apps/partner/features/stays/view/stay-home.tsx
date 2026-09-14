"use client";

import React from "react";
import Link from "next/link";
import { useCurrentSession } from "@vsolve/query";
import {
  Building2,
  CalendarCheck,
  MapPin,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
  ChevronRight,
  ArrowRight,
  Clock,
  AlertCircle,
  Star,
  Calendar,
  Phone,
  Mail,
} from "lucide-react";

import { getApiClient } from "@/lib/api/browser";
import { formatMoney } from "@vsolve/ui";
import {
  usePartnerStayProperties,
  usePartnerStayReservations,
  usePartnerPropertyVisits,
  type PartnerReservationItem,
  type PropertyVisitItem,
} from "@/features/stays/queries";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Thin wrapper so every call site keeps using formatPaise (paise is the
// unit stored everywhere) while the actual currency formatting lives in one
// place: @vsolve/ui's formatMoney (locale grouping, paise-only-when-needed).
function formatPaise(paise: number): string {
  return formatMoney(paise);
}

interface DisplayProperty {
  id: string;
  title: string;
  locality: string;
  property_type: string;
  total_units: number;
  active_guests: number;
  rating: number;
  imageUrl: string;
}

/* =========================================================================
   SUBURBAN HOUSE HERO ILLUSTRATION (MATCHING IMAGE 2 RIGHT HERO CARD)
   ========================================================================= */
function HeroHouseIllustration() {
  return (
    <div className="relative h-20 w-32 shrink-0 sm:h-24 sm:w-40">
      <svg
        viewBox="0 0 160 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full drop-shadow-xs"
        aria-hidden="true"
      >
        {/* Soft Sky Backdrop & Sun Glow */}
        <circle cx="128" cy="24" r="16" fill="#fef08a" fillOpacity="0.45" />
        <ellipse cx="40" cy="22" rx="20" ry="8" fill="#e0f2fe" fillOpacity="0.6" />
        <ellipse cx="90" cy="18" rx="16" ry="6" fill="#e0f2fe" fillOpacity="0.6" />

        {/* Rolling Green Hill / Ground */}
        <ellipse cx="80" cy="108" rx="84" ry="24" fill="#bbf7d0" />
        <ellipse cx="80" cy="104" rx="80" ry="18" fill="#86efac" />

        {/* Left Garden Trees */}
        <rect x="22" y="58" width="4" height="22" rx="2" fill="#a16207" />
        <circle cx="24" cy="52" r="13" fill="#4ade80" />
        <circle cx="21" cy="48" r="9" fill="#22c55e" />

        <rect x="36" y="66" width="3" height="14" rx="1.5" fill="#a16207" />
        <circle cx="37.5" cy="62" r="8.5" fill="#16a34a" />

        {/* Right Garden Tree */}
        <rect x="136" y="60" width="4" height="20" rx="2" fill="#a16207" />
        <circle cx="138" cy="52" r="12" fill="#4ade80" />
        <circle cx="140" cy="49" r="8" fill="#22c55e" />

        {/* Main Suburban House Body */}
        <rect x="48" y="44" width="66" height="38" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />

        {/* Chimney */}
        <rect x="94" y="24" width="8" height="18" rx="1" fill="#cbd5e1" />
        <rect x="92" y="23" width="12" height="3" rx="1" fill="#94a3b8" />

        {/* Pitched Roof (Slate Blue) */}
        <path
          d="M44 45L81 20L118 45H44Z"
          fill="#94a3b8"
          stroke="#64748b"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M81 20L118 45H114L81 22.5L48 45H44L81 20Z"
          fill="#64748b"
        />

        {/* Upstairs Windows */}
        <rect x="58" y="50" width="12" height="12" rx="1.5" fill="#e0f2fe" stroke="#64748b" strokeWidth="1" />
        <line x1="64" y1="50" x2="64" y2="62" stroke="#64748b" strokeWidth="0.75" />
        <line x1="58" y1="56" x2="70" y2="56" stroke="#64748b" strokeWidth="0.75" />

        <rect x="92" y="50" width="12" height="12" rx="1.5" fill="#e0f2fe" stroke="#64748b" strokeWidth="1" />
        <line x1="98" y1="50" x2="98" y2="62" stroke="#64748b" strokeWidth="0.75" />
        <line x1="92" y1="56" x2="104" y2="56" stroke="#64748b" strokeWidth="0.75" />

        {/* Downstairs Window */}
        <rect x="58" y="68" width="12" height="12" rx="1.5" fill="#e0f2fe" stroke="#64748b" strokeWidth="1" />
        <line x1="64" y1="68" x2="64" y2="80" stroke="#64748b" strokeWidth="0.75" />
        <line x1="58" y1="74" x2="70" y2="74" stroke="#64748b" strokeWidth="0.75" />

        {/* Front Door */}
        <rect x="80" y="66" width="10" height="16" rx="1" fill="#78716c" stroke="#57534e" strokeWidth="1" />
        <circle cx="88" cy="74" r="0.8" fill="#fef08a" />

        {/* Bushes by the wall */}
        <circle cx="50" cy="81" r="5" fill="#22c55e" />
        <circle cx="112" cy="81" r="5" fill="#22c55e" />
      </svg>
    </div>
  );
}

/* =========================================================================
   EMPTY STATE OUTLINE ICONS (MATCHING IMAGE 2 PRECISELY)
   ========================================================================= */
function CalendarCheckEmptyIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-11 w-11 text-neutral-300"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="10" width="32" height="30" rx="4" />
      <line x1="16" y1="6" x2="16" y2="12" />
      <line x1="32" y1="6" x2="32" y2="12" />
      <line x1="8" y1="18" x2="40" y2="18" />
      <path d="M19 29L23 33L29 25" strokeWidth="1.75" />
    </svg>
  );
}

function BedEmptyIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-11 w-11 text-neutral-300"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 36V18" />
      <path d="M40 36V26" />
      <path d="M8 28H40V36H8V28Z" />
      <path d="M8 24C8 21.79 9.79 20 12 20H22C24.21 20 26 21.79 26 24V28H8V24Z" />
      <rect x="12" y="22" width="6" height="4" rx="1" />
      <rect x="22" y="22" width="6" height="4" rx="1" />
    </svg>
  );
}

/* =========================================================================
   MAIN COMPONENT: StayHome
   ========================================================================= */
export function StayHome() {
  const session = useCurrentSession(getApiClient());
  const user = session.data?.user;
  const rawName = user?.display_name || user?.full_name?.split(" ")[0] || "Host";
  const userName = rawName.trim();

  const { data: properties, isLoading: propsLoading } = usePartnerStayProperties();
  const { data: reservations, isLoading: resLoading, isError, error } = usePartnerStayReservations();
  const { data: visits, isLoading: visitsLoading } = usePartnerPropertyVisits();

  const today = todayIso();
  const allProps = properties ?? [];
  const allRes = reservations ?? [];
  const allVisits = visits ?? [];

  const computedUnits = allProps.reduce((acc, p) => acc + (p.total_units || 0), 0);
  const totalUnits = computedUnits;
  const totalPropertiesCount = allProps.length;

  const activeInStay = allRes.filter((r) => r.status === "CHECKED_IN" || r.status === "IN_STAY");
  const arrivalsToday = allRes.filter(
    (r) => r.status === "CONFIRMED" && r.start_date <= today,
  );
  const totalBookingsCount = allRes.length;

  // Prepare 3 properties for the bottom grid
  const displayProperties: DisplayProperty[] = allProps.slice(0, 3).map((p) => ({
          id: p.id,
          title: p.title,
          locality: p.locality,
          property_type: p.property_type_display,
          total_units: p.total_units,
          active_guests: p.active_guests,
          rating: p.rating,
          imageUrl: p.image_url,
        }));

  if (propsLoading || resLoading) {
    return (
      <div className="w-full pb-20 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-sm text-neutral-500 flex items-center gap-2">
          <Clock className="h-4 w-4 animate-spin text-neutral-400" />
          Loading your host workspace…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full pb-20 pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error instanceof Error ? error.message : "Unable to load your host workspace."}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4.5rem)] bg-[#fafafa] pb-20 pt-6 sm:pt-8 text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* =========================================================================
            HERO TOP SECTION
            ========================================================================= */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f0ff] border border-[#e9d5ff] px-3.5 py-1 text-xs font-semibold text-[#7c3aed]">
              <Building2 className="h-3.5 w-3.5" />
              <span>Stays Host Portal</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
              Welcome back, {userName}!
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-neutral-500">
              Manage your properties, guests, bookings and more — all in one place.
            </p>
          </div>

          {/* Right Hero Promo Card */}
          <div className="flex items-center gap-4 sm:gap-6 rounded-2xl border border-neutral-100 bg-gradient-to-r from-blue-50/50 via-white to-white p-4 sm:p-5 shadow-xs shrink-0 max-w-md w-full sm:w-auto">
            <HeroHouseIllustration />
            <div className="pr-2">
              <h3 className="text-base sm:text-lg font-black leading-tight text-neutral-900">
                Create better stays,
                <br />
                Happier guests.
              </h3>
              <p className="mt-1.5 text-xs font-medium text-neutral-500">
                Manage. Host. Earn. Grow.
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================================
            4 STAT METRIC CARDS
            ========================================================================= */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Properties */}
          <Link
            href="/stays/properties"
            className="group relative rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs hover:border-neutral-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-neutral-600">Properties</span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400 group-hover:text-neutral-900 group-hover:border-neutral-300 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-neutral-900 tracking-tight">
              {totalPropertiesCount}
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              {totalUnits} total physical units
            </div>
          </Link>

          {/* Card 2: In-Stay Guests */}
          <Link
            href="/stays/reservations"
            className="group relative rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs hover:border-neutral-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Users className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-neutral-600">In-Stay Guests</span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400 group-hover:text-neutral-900 group-hover:border-neutral-300 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-neutral-900 tracking-tight">
              {activeInStay.length}
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              Currently residing
            </div>
          </Link>

          {/* Card 3: Arrivals Today */}
          <Link
            href="/stays/reservations"
            className="group relative rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs hover:border-neutral-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-neutral-600">Arrivals Today</span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400 group-hover:text-neutral-900 group-hover:border-neutral-300 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-neutral-900 tracking-tight">
              {arrivalsToday.length}
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              Awaiting ID check-in
            </div>
          </Link>

          {/* Card 4: Total Bookings */}
          <Link
            href="/stays/reservations"
            className="group relative rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs hover:border-neutral-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-neutral-600">Total Bookings</span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400 group-hover:text-neutral-900 group-hover:border-neutral-300 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-neutral-900 tracking-tight">
              {totalBookingsCount}
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              Across all timelines
            </div>
          </Link>
        </div>

        {/* =========================================================================
            OPERATIONS & QUICK ACTIONS SECTION (2 COLUMNS)
            ========================================================================= */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Sub-Cards: Arrivals Due & Currently In-Stay */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card A: Arrivals Due */}
            <div className="flex flex-col justify-between rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs min-h-[220px]">
              <div>
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">Arrivals Due</h3>
                      <p className="text-[11px] text-neutral-400">Guests scheduled for check-in today</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-orange-50 border border-orange-200/60 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                    {arrivalsToday.length}
                  </span>
                </div>

                <div className="mt-2 divide-y divide-neutral-100">
                  {arrivalsToday.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-7 text-center">
                      <CalendarCheckEmptyIcon />
                      <p className="mt-3 text-xs font-medium text-neutral-500">
                        No guest arrivals awaiting check-in today.
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        You&apos;re all caught up!
                      </p>
                    </div>
                  ) : (
                    arrivalsToday.map((res) => (
                      <ReservationItemRow key={res.id} res={res} actionLabel="Check In Guest" />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Card B: Currently In-Stay */}
            <div className="flex flex-col justify-between rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs min-h-[220px]">
              <div>
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">Currently In-Stay</h3>
                      <p className="text-[11px] text-neutral-400">Active occupants in property units</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    {activeInStay.length}
                  </span>
                </div>

                <div className="mt-2 divide-y divide-neutral-100">
                  {activeInStay.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-7 text-center">
                      <BedEmptyIcon />
                      <p className="mt-3 text-xs font-medium text-neutral-500">
                        No guests currently checked in.
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        Enjoy a smooth day!
                      </p>
                    </div>
                  ) : (
                    activeInStay.map((res) => (
                      <ReservationItemRow key={res.id} res={res} actionLabel="Inspect & Check Out" />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Quick Actions Card */}
          <div className="lg:col-span-1 rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
                <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
                <h3 className="text-sm sm:text-base font-bold text-neutral-900">Quick Actions</h3>
              </div>

              <div className="mt-3 space-y-1">
                {/* Action 1 */}
                <Link
                  href="/stays/properties"
                  className="group flex items-center justify-between rounded-xl p-2.5 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-neutral-900 group-hover:text-purple-600 transition-colors">
                        Manage Properties
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        View and update your property details
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all" />
                </Link>

                {/* Action 2 */}
                <Link
                  href="/stays/reservations"
                  className="group flex items-center justify-between rounded-xl p-2.5 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-neutral-900 group-hover:text-blue-600 transition-colors">
                        View All Bookings
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Check upcoming and past bookings
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all" />
                </Link>

                {/* Action 3 */}
                <Link
                  href="/stays/reservations?action=check-in"
                  className="group flex items-center justify-between rounded-xl p-2.5 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-neutral-900 group-hover:text-emerald-600 transition-colors">
                        Guest Check-in
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Verify IDs and check in guests
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all" />
                </Link>

                {/* Action 4 */}
                <Link
                  href="/stays/reservations?tab=deposits"
                  className="group flex items-center justify-between rounded-xl p-2.5 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-neutral-900 group-hover:text-orange-600 transition-colors">
                        Security Deposits
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Manage and track deposits
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            TENANT VISITS & WALKTHROUGH REQUESTS (GET /api/v1/stays/partner/visits/)
            ========================================================================= */}
        <div className="mt-8 rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Tenant Visits &amp; Walkthrough Requests</h3>
                <p className="text-xs text-neutral-400">Scheduled in-person property viewings requested by potential tenants</p>
              </div>
            </div>
            {allVisits.length > 0 && (
              <span className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-bold text-purple-700">
                {allVisits.length} Requested
              </span>
            )}
          </div>

          {visitsLoading ? (
            <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
              <Clock className="h-4 w-4 animate-spin" /> Loading tenant visits…
            </div>
          ) : allVisits.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-neutral-200 p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-neutral-300 mb-2" />
              <p className="text-xs font-bold text-neutral-600">No In-Person Visits Scheduled</p>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                When prospective tenants request an in-person walkthrough from your property listings, their requests will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allVisits.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-2.5 hover:border-neutral-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black text-neutral-900">{v.visitor_name}</h4>
                      <p className="text-[11px] text-neutral-500 font-medium">{v.preferred_date} • {v.time_slot}</p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        v.status === "CONFIRMED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : v.status === "CANCELLED"
                          ? "bg-neutral-100 text-neutral-500"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  {v.notes && (
                    <p className="text-[11px] text-neutral-600 bg-white p-2 rounded-lg border border-neutral-100 italic">
                      &quot;{v.notes}&quot;
                    </p>
                  )}

                  <div className="pt-2 border-t border-neutral-200/60 flex items-center justify-between text-xs">
                    <a
                      href={`tel:${v.visitor_phone}`}
                      className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      <Phone className="h-3 w-3" /> {v.visitor_phone}
                    </a>
                    {v.visitor_email && (
                      <a
                        href={`mailto:${v.visitor_email}`}
                        className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-700"
                        title={v.visitor_email}
                      >
                        <Mail className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* =========================================================================
            YOUR PROPERTIES SECTION (BOTTOM 3-CARD ROW)
            ========================================================================= */}
        <div className="mt-8 rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Your Properties</h3>
                <p className="text-xs text-neutral-400">Overview of buildings and active guest occupancy</p>
              </div>
            </div>
            <Link
              href="/stays/properties"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            {displayProperties.map((prop) => (
              <Link
                key={prop.id}
                href="/stays/properties"
                className="group rounded-2xl border border-neutral-200/80 bg-white p-3.5 hover:border-neutral-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Photo with Property Type Badge */}
                  <div className="relative h-44 w-full overflow-hidden rounded-xl bg-neutral-100">
                    <img
                      src={prop.imageUrl}
                      alt={prop.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute top-2.5 right-2.5 rounded-full bg-white/95 backdrop-blur-xs border border-neutral-200/80 px-3 py-0.5 text-[11px] font-semibold text-neutral-700 shadow-xs">
                      {prop.property_type}
                    </div>
                  </div>

                  {/* Title, Locality & Arrow */}
                  <div className="mt-3.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-neutral-900 truncate group-hover:text-indigo-600 transition-colors">
                        {prop.title}
                      </h4>
                      <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                        <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate">{prop.locality}</span>
                      </p>
                    </div>

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-400 group-hover:text-neutral-900 group-hover:border-neutral-400 transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Units, Active Guests, Rating */}
                <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Units:</span>
                    <strong className="font-bold text-neutral-900">{prop.total_units}</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Active Guests:</span>
                    <strong className="font-bold text-emerald-600">{prop.active_guests}</strong>
                  </div>

                  <div className="flex items-center gap-1 font-bold text-neutral-900">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{prop.rating.toFixed(1)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   RESERVATION ITEM ROW (FOR ACTIVE BOOKINGS / ARRIVALS LIST)
   ========================================================================= */
function ReservationItemRow({ res, actionLabel }: { res: PartnerReservationItem; actionLabel: string }) {
  return (
    <div className="py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-neutral-900 truncate">{res.property_title}</span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700">
            {res.unit_code || res.unit_name}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-400 flex items-center gap-2">
          <span>{res.start_date} → {res.end_date}</span>
          <span>•</span>
          <span>{res.guest_count} guest{res.guest_count > 1 ? "s" : ""}</span>
          <span>•</span>
          <span className="font-bold text-neutral-800">{formatPaise(res.total_amount_paise)}</span>
        </div>
      </div>
      <Link
        href={`/stays/reservations?id=${res.id}`}
        className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 shadow-xs hover:border-neutral-400 hover:bg-neutral-50 transition-colors"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
