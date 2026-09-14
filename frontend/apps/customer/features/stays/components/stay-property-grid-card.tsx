"use client";

import React from "react";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Wifi,
  Sparkles,
  Bath,
  Tv,
  Car,
  Utensils,
  Wind,
} from "lucide-react";
import type { StayBrowseUnitCard } from "../queries";
import { occupancyLabel, vacancyLabel, formatMoney } from "@vsolve/ui";

// Thin wrapper so every call site keeps using formatPaise (paise is the
// unit stored everywhere) while the actual currency formatting lives in one
// place: @vsolve/ui's formatMoney (locale grouping, paise-only-when-needed).
function formatPaise(paise: number): string {
  return formatMoney(paise);
}

function pricePeriodSuffix(mode?: string): string {
  switch (mode) {
    case "NIGHTLY":
    case "DAILY":
      return "/night";
    case "WEEKLY":
      return "/wk";
    case "HOURLY":
      return "/hr";
    default:
      return "/mo";
  }
}

function getAmenityIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("wi-fi") || lower.includes("wifi") || lower.includes("internet")) {
    return <Wifi className="size-3 text-gray-500 shrink-0" />;
  }
  if (lower.includes("bath") || lower.includes("toilet")) {
    return <Bath className="size-3 text-gray-500 shrink-0" />;
  }
  if (lower.includes("ac") || lower.includes("air condition")) {
    return <Wind className="size-3 text-gray-500 shrink-0" />;
  }
  if (lower.includes("tv") || lower.includes("smart tv")) {
    return <Tv className="size-3 text-gray-500 shrink-0" />;
  }
  if (lower.includes("parking")) {
    return <Car className="size-3 text-gray-500 shrink-0" />;
  }
  if (lower.includes("food") || lower.includes("meal") || lower.includes("breakfast") || lower.includes("kitchen")) {
    return <Utensils className="size-3 text-gray-500 shrink-0" />;
  }
  return <Sparkles className="size-3 text-gray-500 shrink-0" />;
}

export function StayPropertyGridCard({
  card,
  activeTileSlug,
  startDate,
  endDate,
}: {
  card: StayBrowseUnitCard;
  activeTileSlug?: string;
  startDate?: string;
  endDate?: string;
}) {
  const occupancyChip = occupancyLabel(card);
  const isHotel = card.occupancy_model === "HOTEL_ROOM";

  const query = new URLSearchParams();
  if (activeTileSlug) query.set("tile", activeTileSlug);
  if (startDate) query.set("start_date", startDate);
  if (endDate) query.set("end_date", endDate);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const propertyHref = `/stays/property/${card.property_id}${suffix}`;

  const unitsText = vacancyLabel(card.units_available, card.occupancy_model);

  const isGreenBadge = card.units_available >= 3;

  return (
    <article className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:border-[#f87000]/60 hover:shadow-md transition-all duration-200">
      <div>
        {/* Photo Container */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100">
          <Link href={propertyHref} className="block h-full w-full">
            {card.image_url ? (
              <img
                src={card.image_url}
                alt={card.property_title}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                <Building2 className="h-12 w-12 stroke-[1.2]" />
              </div>
            )}
          </Link>

          {/* Units Available Pill Badge (Top Left) */}
          <div className="absolute top-3 left-3">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-xs ${
                isGreenBadge ? "bg-[#10B981]" : "bg-[#F97316]"
              }`}
            >
              {unitsText}
            </span>
          </div>

          {/* Wave U3 (C10): the save/heart toggle used to be local-only state
              with no backing API -- it looked like a "saved properties"
              feature that didn't actually exist and reset on every reload.
              Removed until there's a real endpoint to wire it to. */}

          {card.rating > 0 ? (
            <div className="absolute bottom-3 right-3">
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-0.5 text-xs font-black text-navy-900 shadow-xs backdrop-blur-xs">
                <span className="text-[#F5A524]" aria-hidden>★</span>
                <span>{card.rating.toFixed(1)}</span>
              </span>
            </div>
          ) : null}
        </div>

        {/* Card Body */}
        <div className="p-4">
          <Link href={propertyHref} className="block">
            <h3 className="font-extrabold text-[15px] text-navy-900 group-hover:text-[#f87000] transition-colors line-clamp-1 leading-snug">
              {card.property_title}
            </h3>
          </Link>

          <div className="mt-1 flex items-center text-xs text-gray-500">
            <p className="flex items-center gap-1 line-clamp-1 min-w-0">
              <MapPin className="size-3.5 text-[#f87000] shrink-0" />
              <span className="truncate">{card.locality}</span>
            </p>
          </div>

          {/* Tag Chips Row */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {card.is_ac ? (
              <span className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[11px] font-bold text-navy-900">
                AC
              </span>
            ) : (
              <span className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                Non-AC
              </span>
            )}

            {occupancyChip ? (
              <span className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[11px] font-medium text-navy-800">
                {occupancyChip}
              </span>
            ) : null}

            {card.furnishing_display ? (
              <span className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[11px] font-medium text-navy-800">
                {card.furnishing_display}
              </span>
            ) : null}

            {card.food_included && (
              <span className="rounded-md bg-orange-50 border border-orange-200/60 px-2 py-0.5 text-[11px] font-bold text-[#b84814]">
                With Food
              </span>
            )}
          </div>

          {/* Amenities Row */}
          {card.amenities && card.amenities.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap text-[11px] text-gray-600 font-medium">
              {card.amenities.slice(0, 3).map((am) => (
                <span key={am} className="inline-flex items-center gap-1 text-gray-600">
                  {getAmenityIcon(am)}
                  <span>{am}</span>
                </span>
              ))}
              {card.amenities.length > 3 && (
                <span className="text-gray-400 text-[11px] font-semibold">
                  +{card.amenities.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pricing & CTA */}
      <div className="border-t border-gray-100 bg-[#FAF9F7]/70 p-4 flex items-center justify-between">
        <div>
          <div className="text-base sm:text-lg font-black text-navy-900 tracking-tight">
            ₹{card.price_per_month.toLocaleString("en-IN")}
            <span className="text-xs font-semibold text-gray-500"> {pricePeriodSuffix(card.duration_mode)}</span>
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            Deposit: {formatPaise(card.deposit_paise)}
          </div>
        </div>

        <Link
          href={propertyHref}
          className="inline-flex items-center justify-center rounded-xl bg-[#f87000] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#e06500] active:scale-95 transition-all shrink-0"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}
