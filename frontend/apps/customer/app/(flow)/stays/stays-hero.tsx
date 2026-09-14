"use client";

/**
 * Trimmed hero band for /stays.
 *
 * Wave C3 (Django_Next.js_Plan/M3/07-a9-stays-ux-overhaul-plan.md): this used
 * to sit above a fully hardcoded, fake "93 services" directory where every
 * link — regardless of which specific service pill was clicked — collapsed
 * to the same coarse `/catalog/rooms-pg-hostel?tile=rooms` URL. That directory
 * is gone; this hero (the parts of the old page that were genuinely useful —
 * branding, locality search entry point, popular-locality shortcuts) now sits
 * directly above the real, working browse experience
 * (`CategoryTileBrowser` / `StayCatalogListingPane`), rendered by the server
 * page below it. The search bar and locality chips are honest about what
 * they do: they take you to the real browse experience, they do not pretend
 * to filter by locality themselves.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, MapPin, Search } from "lucide-react";

const POPULAR_HERO_CHIPS = [
  "Gachibowli",
  "Madhapur",
  "Hitech City",
  "Kondapur",
  "Ameerpet",
  "LB Nagar",
];

export function StaysHero() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = () => {
    router.push("/catalog/rooms-pg-hostel?tile=rooms");
  };

  return (
    <section className="pt-6 sm:pt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1 max-w-xl">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-gray-700 hover:text-navy-900 transition-colors mb-3"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>All Services</span>
          </Link>

          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-black tracking-tight text-[#001844] leading-tight">
            Rooms, PG &amp; Hostels
          </h1>

          <p className="mt-1.5 text-sm sm:text-base font-medium text-gray-500">
            Find a stay that fits your lifestyle. Verified properties with zero brokerage.
          </p>

          <div className="mt-3.5 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-navy-900">
            <MapPin className="h-4 w-4 text-navy-900 shrink-0" />
            <span>Hyderabad, Telangana</span>
          </div>
        </div>

        <div className="relative w-full md:w-[440px] lg:w-[500px] h-[190px] sm:h-[220px] rounded-2xl overflow-hidden shadow-xs shrink-0 border border-gray-100">
          <img
            src="/stays/hero_bedroom.jpg"
            alt="Rooms, PG & Hostels in Hyderabad"
            className="w-full h-full object-cover"
          />

          <div className="absolute top-3.5 right-4 select-none pointer-events-none text-right">
            <div className="font-extrabold text-[#001844] text-lg sm:text-2xl leading-[1.05] tracking-tight rotate-[-4deg] drop-shadow-sm font-serif italic">
              <span className="block">Better</span>
              <span className="block">Stays</span>
              <span className="block">Brighter</span>
              <span className="relative inline-block pr-1">
                Days
                <svg
                  className="absolute -bottom-1 left-0 w-full h-2 text-[#f87000]"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                  fill="currentColor"
                >
                  <path d="M0,15 Q50,0 100,12 Q50,5 0,15 Z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 sm:mt-8">
        <div className="flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-gray-200/90 bg-white p-1.5 sm:p-2 shadow-xs focus-within:border-gray-300 focus-within:shadow-sm transition-all">
          <div className="relative flex-1 w-full flex items-center">
            <Search className="h-4 sm:h-5 w-4 sm:w-5 text-gray-400 ml-3 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by locality, area or landmark (e.g. Gachibowli, Madhapur, Kondapur...)"
              className="w-full pl-3 pr-4 py-2 text-xs sm:text-sm font-normal text-navy-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
            />
          </div>
          <button
            onClick={handleSearch}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f87000] px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#e06500] transition-colors shrink-0 cursor-pointer"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
          </button>
        </div>

        <div className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-semibold text-gray-500 shrink-0 mr-1">Popular:</span>
          {POPULAR_HERO_CHIPS.map((loc) => (
            <Link
              key={loc}
              href="/catalog/rooms-pg-hostel?tile=rooms"
              className="rounded-full border border-gray-200/80 bg-white px-4 py-1 text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors whitespace-nowrap shadow-2xs"
            >
              {loc}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
