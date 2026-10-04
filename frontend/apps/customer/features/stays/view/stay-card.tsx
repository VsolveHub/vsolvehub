"use client";

import Link from "next/link";
import { ArrowRight, MapPin, ShieldCheck, Users } from "lucide-react";
import { Button } from "@vsolve/ui";

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

interface StayCardProps {
  property: StayProperty | StayPropertySummary;
}

export function StayCard({ property }: StayCardProps) {
  const saved = useSavedItems("stay");
  const minRate = property.units.reduce(
    (min, u) => (u.nightly_rate_paise < min ? u.nightly_rate_paise : min),
    property.units[0]?.nightly_rate_paise ?? 0,
  );

  const primaryUnit = property.units[0];
  const occupancy = primaryUnit ? roomOccupancyLabel(primaryUnit, property.room_style) : null;
  // Only what the host said yes to, labelled by the server; the card has room for three.
  const amenities = (property.amenities ?? []).slice(0, 3);
  const hero =
    Array.isArray((property as { media?: { url?: string }[] }).media) &&
    (property as { media: { url?: string }[] }).media[0]?.url
      ? (property as { media: { url: string }[] }).media[0].url
      : null;

  const detailHref = stayHref(property.slug);
  const averageRating = (property as StayPropertySummary).average_rating;
  const reviewCount = (property as StayPropertySummary).review_count;

  const rawPref =
    (property as { tenant_preference?: string }).tenant_preference ||
    (property as { structured_fields?: { tenant_preference?: string } }).structured_fields?.tenant_preference;
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
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:border-line-strong hover:shadow-raised">
      {/* Stretched link under content. Content is pointer-events-none so clicks
          reach the link; SaveHeart re-enables pointer events. */}
      <Link
        href={detailHref}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        aria-label={`View ${property.title}`}
      />
      {hero ? (
        <div className="pointer-events-none -mx-5 -mt-5 mb-3 aspect-[16/10] overflow-hidden bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt="" className="h-full w-full object-cover transition duration-slow group-hover:scale-[1.03]" />
        </div>
      ) : null}
      <div className="relative z-[1] pointer-events-none flex flex-col gap-3">
        <div className="relative z-10 flex justify-end pointer-events-auto">
          <SaveHeart saved={saved.isSaved(property.id)} onToggle={() => saved.toggle(property.id)} />
        </div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Verified host
          </span>
          <div className="flex items-center gap-2">
            {averageRating ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200">
                ★ {averageRating} {reviewCount ? `(${reviewCount})` : ""}
              </span>
            ) : null}
          </div>
        </div>

        {/* Title and Host */}
        <div>
          <h3 className="text-lg font-bold text-text group-hover:text-action">
            {property.title}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-secondary">
            Hosted by <span className="font-semibold text-text">{property.host_name}</span>
          </p>
        </div>

        {/* Description */}
        {property.description && (
          <p className="line-clamp-2 text-xs text-text-secondary leading-relaxed">
            {property.description}
          </p>
        )}

        {/* Location text */}
        {property.location_text && (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin className="size-3.5 shrink-0 text-text-secondary" />
            <span className="truncate">{property.location_text}</span>
          </div>
        )}

        {/* Amenities & Sharing Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tenantLabel ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy-900 border border-navy-200">
              {tenantLabel}
            </span>
          ) : null}

          {occupancy ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-line/60">
              <Users className="size-3" />
              {occupancy}
            </span>
          ) : null}

          {amenities.map((amenity) => {
            const Icon = amenityIcon(amenity.key);
            return (
              <span
                key={amenity.key}
                className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-line/60"
              >
                <Icon className="size-3" aria-hidden />
                {amenity.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Pricing and Action Footer */}
      <div className="relative z-[1] pointer-events-none mt-5 border-t border-line/70 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-text">
                {formatPaise(minRate)}
              </span>
              <span className="text-xs font-medium text-text-secondary">
                / {pricePeriodOf(property.price_period) === "NIGHT" ? "night" : "month"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-text-secondary">
              {typeof property.min_stay_nights === "number" && property.min_stay_nights > 1
                ? `Minimum stay ${stayLengthLabel(property.min_stay_nights, pricePeriodOf(property.price_period))} · `
                : ""}
              Enquire and the host calls you
            </p>
          </div>

          <Button
            size="sm"
            className="inline-flex items-center gap-1.5 font-bold"
            tabIndex={-1}
            aria-hidden
          >
            Check Dates
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
