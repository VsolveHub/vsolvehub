"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Heart,
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

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
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

// Deterministic distance calculation based on property id hash for demo fidelity
function getSimulatedDistance(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const dist = (Math.abs(hash % 35) + 10) / 10;
  return `${dist.toFixed(1)} km`;
}

export function StayPropertyGridCard({
  card,
  activeTileSlug,
}: {
  card: StayBrowseUnitCard;
  activeTileSlug?: string;
}) {
  const [isSaved, setIsSaved] = useState(false);
  const distance = getSimulatedDistance(card.property_id || card.unit_type_id);

  const propertyHref = activeTileSlug
    ? `/stays/property/${card.property_id}?tile=${encodeURIComponent(activeTileSlug)}`
    : `/stays/property/${card.property_id}`;

  // Available units text
  const unitsText = card.units_available > 0
    ? `${card.units_available} unit${card.units_available > 1 ? "s" : ""} available`
    : "Units available";

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

          {/* Heart Button (Top Right) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setIsSaved(!isSaved);
            }}
            aria-label={isSaved ? "Remove from saved" : "Save property"}
            className="absolute top-3 right-3 size-8 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-gray-400 hover:text-red-500 hover:scale-110 active:scale-95 transition-all shadow-xs"
          >
            <Heart
              className={`size-4 ${isSaved ? "fill-red-500 text-red-500" : "text-gray-600"}`}
            />
          </button>

          {/* Rating Badge (Bottom Right or overlay) */}
          <div className="absolute bottom-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-0.5 text-xs font-black text-navy-900 shadow-xs backdrop-blur-xs">
              <span className="text-[#F5A524]" aria-hidden>★</span>
              <span>{card.rating ? card.rating.toFixed(1) : "4.8"}</span>
            </span>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4">
          <Link href={propertyHref} className="block">
            <h3 className="font-extrabold text-[15px] text-navy-900 group-hover:text-[#f87000] transition-colors line-clamp-1 leading-snug">
              {card.property_title}
            </h3>
          </Link>

          {/* Location & Distance */}
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
            <p className="flex items-center gap-1 line-clamp-1 min-w-0">
              <MapPin className="size-3.5 text-[#f87000] shrink-0" />
              <span className="truncate">{card.locality}</span>
            </p>
            <span className="shrink-0 text-[11px] text-gray-400 font-medium pl-2">
              📍 {distance}
            </span>
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

            {card.sharing_display ? (
              <span className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[11px] font-medium text-navy-800">
                {card.sharing_display}
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
            <span className="text-xs font-semibold text-gray-500"> /mo</span>
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
