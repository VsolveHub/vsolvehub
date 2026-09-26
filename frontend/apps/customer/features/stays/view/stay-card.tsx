"use client";

import Link from "next/link";
import { ArrowRight, Building, Check, Coffee, MapPin, ShieldCheck, Users, Wind, Wifi } from "lucide-react";
import { Badge, Button } from "@vsolve/ui";

import { SaveHeart, useSavedItems } from "@/features/part-a";

import { formatPaise, stayFields, type StayProperty } from "../model";

interface StayCardProps {
  property: StayProperty;
}

export function StayCard({ property }: StayCardProps) {
  const saved = useSavedItems("stay");
  const minRate = property.units.reduce(
    (min, u) => (u.nightly_rate_paise < min ? u.nightly_rate_paise : min),
    property.units[0]?.nightly_rate_paise ?? 0,
  );

  const primaryUnit = property.units[0];
  const sharingCount = primaryUnit?.sharing_count ?? 1;
  const fields = stayFields(property.structured_fields);
  const isAc = Boolean(fields.ac);
  const hasFood = Boolean(fields.food);
  const hasWifi = Boolean(fields.wifi);
  const hero =
    Array.isArray((property as { media?: { url?: string }[] }).media) &&
    (property as { media: { url?: string }[] }).media[0]?.url
      ? (property as { media: { url: string }[] }).media[0].url
      : null;

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:border-line-strong hover:shadow-raised">
      {hero ? (
        <div className="-mx-5 -mt-5 mb-3 aspect-[16/10] overflow-hidden bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt="" className="h-full w-full object-cover transition duration-slow group-hover:scale-[1.03]" />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <SaveHeart saved={saved.isSaved(property.id)} onToggle={() => saved.toggle(property.id)} />
        </div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <Building className="size-3" />
            Verified Stay
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Verified Host
          </span>
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
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-line/60">
            <Users className="size-3" />
            {sharingCount === 1 ? "Private Single" : `${sharingCount} Sharing`}
          </span>

          {isAc && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-line/60">
              <Wind className="size-3" />
              AC Room
            </span>
          )}

          {hasFood && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-line/60">
              <Coffee className="size-3" />
              Meals Included
            </span>
          )}

          {hasWifi && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-line/60">
              <Wifi className="size-3" />
              WiFi
            </span>
          )}
        </div>
      </div>

      {/* Pricing and Action Footer */}
      <div className="mt-5 border-t border-line/70 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-text">
                {formatPaise(minRate)}
              </span>
              <span className="text-xs font-medium text-text-secondary">/ night</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-text-secondary">
              Enquiry-first booking · Instant date quote
            </p>
          </div>

          <Link href={`/stays/${property.id}`}>
            <Button size="sm" className="inline-flex items-center gap-1.5 font-bold">
              Check Dates
              <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}
