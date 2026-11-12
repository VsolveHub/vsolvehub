"use client";

import Link from "next/link";
import { Building2, MapPin, Users } from "lucide-react";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { stayHref } from "@/lib/routes";

import {
  formatPaise,
  pricePeriodOf,
  roomOccupancyLabel,
  stayLengthLabel,
  type StayProperty,
  type StayPropertySummary,
} from "../model";
import { amenityIcon } from "./amenity-icon";

interface StayRowCardProps {
  property: StayProperty | StayPropertySummary;
  onQuickCheck: (property: StayProperty | StayPropertySummary) => void;
}

export function StayRowCard({ property, onQuickCheck }: StayRowCardProps) {
  const saved = useSavedItems("stay");
  const minRate = property.units.reduce(
    (min, u) => (u.nightly_rate_paise < min ? u.nightly_rate_paise : min),
    property.units[0]?.nightly_rate_paise ?? 0,
  );
  const primaryUnit = property.units[0];
  const occupancy = primaryUnit ? roomOccupancyLabel(primaryUnit, property.room_style) : null;
  const amenities = (property.amenities ?? []).slice(0, 2);
  const hero =
    (Array.isArray((property as { media?: { url?: string }[] }).media) &&
      (property as { media: { url?: string }[] }).media[0]?.url) ||
    (Array.isArray(property.units) && property.units[0]?.media?.[0]?.url);

  const detailHref = stayHref(property.slug);
  const averageRating = (property as StayPropertySummary).average_rating;
  const reviewCount = (property as StayPropertySummary).review_count;
  const distanceKm = (property as StayPropertySummary).distance_km;
  const period = pricePeriodOf(property.price_period);

  const rawPref =
    (property as { tenant_preference?: string }).tenant_preference ||
    (property as { structured_fields?: { tenant_preference?: string } }).structured_fields
      ?.tenant_preference;
  const tenantLabel =
    rawPref === "BACHELOR_MALE"
      ? "Bachelor (M)"
      : rawPref === "BACHELOR_FEMALE"
        ? "Ladies Only"
        : rawPref === "FAMILY"
          ? "Family Only"
          : rawPref === "WORKING_PROFESSIONAL"
            ? "Professionals"
            : null;

  return (
    <article className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl sm:rounded-[1.25rem] border border-[#e7e2da] bg-white p-3 sm:p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-xs">
      {/* Mobile Clean Layout (full-width footer row so price & CTA never collide below 400px) */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <div className="flex items-start gap-2.5">
          <Link
            href={detailHref}
            className="relative grid size-14 min-[400px]:size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#F4F1EC] shadow-xs"
          >
            {hero ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={hero} alt={property.title} className="size-full object-cover" />
            ) : (
              <Building2 className="size-6 text-text-secondary" strokeWidth={1.6} />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1.5">
              <Link href={detailHref} className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-[13.5px] min-[400px]:text-sm font-bold leading-snug text-navy-900">
                  {property.title}
                </h3>
              </Link>
              <SaveHeart
                saved={saved.isSaved(property.id)}
                onToggle={() => saved.toggle(property.id)}
              />
            </div>

            <p className="mt-1 truncate text-[11.5px] min-[400px]:text-xs text-text-secondary">
              {property.location_text
                ? `${property.location_text}${occupancy ? ` · ${occupancy}` : ""}`
                : `Hosted by ${property.host_name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line/50 pt-2">
          <div className="min-w-0">
            <span className="block text-[10px] font-medium text-text-muted leading-none">
              Starts at
            </span>
            <span className="mt-0.5 block text-[13px] font-extrabold text-navy-900 whitespace-nowrap" data-numeric>
              {formatPaise(minRate)}
              <span className="text-[11px] font-medium text-text-secondary">
                /{period === "NIGHT" ? "night" : "mo"}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onQuickCheck(property)}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-navy-900 px-3.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-navy-800 active:scale-95"
          >
            Check Dates
          </button>
        </div>
      </div>

      {/* Desktop Left Thumbnail */}
      <Link
        href={detailHref}
        className="relative hidden sm:grid size-[5.5rem] shrink-0 place-items-center overflow-hidden rounded-card bg-[#F4F1EC] shadow-xs"
      >
        {hero ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={hero} alt={property.title} className="size-full object-cover" />
        ) : (
          <Building2 className="size-7 text-text-secondary" strokeWidth={1.6} />
        )}
      </Link>

      {/* Desktop Middle Details */}
      <div className="hidden sm:block min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={detailHref} className="min-w-0 hover:text-[#EA580C] transition-colors">
            <h3 className="truncate text-[15px] font-extrabold leading-snug text-navy-900">
              {property.title}
            </h3>
          </Link>
          {averageRating ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
              ★ {averageRating}
              {reviewCount ? ` (${reviewCount})` : ""}
            </span>
          ) : null}
          <SaveHeart
            saved={saved.isSaved(property.id)}
            onToggle={() => saved.toggle(property.id)}
          />
        </div>

        <p className="mt-0.5 text-[12px] font-medium text-text-secondary">
          Hosted by <span className="font-semibold text-navy-900">{property.host_name}</span>
        </p>

        {property.location_text ? (
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
            <MapPin className="size-3.5 shrink-0 text-text-muted" />
            <span className="truncate">{property.location_text}</span>
            {distanceKm != null ? (
              <span className="shrink-0 font-semibold text-navy-900">
                · {distanceKm} km away
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {tenantLabel ? (
            <span className="inline-flex items-center rounded-md border border-navy-200 bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-900">
              {tenantLabel}
            </span>
          ) : null}
          {occupancy ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#e7e2da] bg-[#FAF9F7] px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
              <Users className="size-3" />
              {occupancy}
            </span>
          ) : null}
          {amenities.map((amenity) => {
            const Icon = amenityIcon(amenity.key);
            return (
              <span
                key={amenity.key}
                className="inline-flex items-center gap-1 rounded-md border border-[#e7e2da] bg-[#FAF9F7] px-2 py-0.5 text-[11px] font-semibold text-text-secondary"
              >
                <Icon className="size-3" aria-hidden />
                {amenity.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Desktop Right Price + CTA Column */}
      <div className="hidden sm:flex shrink-0 flex-col items-end gap-2 pl-2">
        <div className="text-right">
          <span className="block text-[11px] font-medium text-text-secondary">Starts at</span>
          <div className="flex items-baseline justify-end gap-1">
            <span
              data-numeric
              className="text-[16px] font-extrabold tabular-nums text-navy-900"
            >
              {formatPaise(minRate)}
            </span>
            <span className="text-[11px] font-medium text-text-secondary">
              /{period === "NIGHT" ? "night" : "mo"}
            </span>
          </div>
          {typeof property.min_stay_nights === "number" && property.min_stay_nights > 1 ? (
            <span className="block text-[11px] text-text-muted">
              Min {stayLengthLabel(property.min_stay_nights, period)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={detailHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-navy-900 bg-white px-3.5 text-[13px] font-bold text-navy-900 transition-colors hover:bg-[#FAF9F7]"
          >
            View details
          </Link>
          <button
            type="button"
            onClick={() => onQuickCheck(property)}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-navy-900 px-4 text-[13px] font-bold text-white shadow-xs transition-colors hover:bg-navy-800"
          >
            Check Dates
          </button>
        </div>
      </div>
    </article>
  );
}

