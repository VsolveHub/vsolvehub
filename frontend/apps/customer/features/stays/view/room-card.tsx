"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, MapPin, ShieldCheck, Users } from "lucide-react";

import { stayHref } from "@/lib/routes";

import { availabilityLabel, formatPaise, pricePeriodOf, roomOccupancyLabel } from "../model";
import type { RoomCard as RoomCardData } from "../room-cards";

const TENANT_LABELS: Record<string, string> = {
  BACHELOR_MALE: "Bachelor (M)",
  BACHELOR_FEMALE: "Ladies only",
  FAMILY: "Family only",
  WORKING_PROFESSIONAL: "Professionals",
};

/** "/stays/<slug>?room=<unit id>": the property page opens with this room chosen. */
export function roomHref(slug: string | undefined | null, unitId: string): string {
  return `${stayHref(slug)}?room=${encodeURIComponent(unitId)}`;
}

/** One room type in search: its photo, what it is, where, and the price. */
export function RoomCard({ card }: { card: RoomCardData }) {
  const { property, unit, moreHere } = card;
  const photo = unit.media?.[0]?.url;
  const period = pricePeriodOf(property.price_period);
  const tenantRaw = (property.structured_fields as { tenant_preference?: string } | null)?.tenant_preference;
  const tenant = tenantRaw ? TENANT_LABELS[tenantRaw] : undefined;
  const photoCount = unit.media?.length ?? 0;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-xs transition hover:border-line-strong hover:shadow-raised">
      <Link
        href={roomHref(property.slug, unit.id)}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        aria-label={`${unit.name} at ${property.title}`}
      />
      <div className="pointer-events-none relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="absolute inset-0 size-full object-cover transition duration-slow group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-text-muted">
            <BedDouble className="size-8" />
          </div>
        )}
        {photoCount > 1 ? (
          <span className="absolute bottom-2 right-2 rounded-control bg-navy-900/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {photoCount} photos
          </span>
        ) : null}
        {property.average_rating ? (
          <span className="absolute left-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-xs font-bold text-amber-700 shadow-xs">
            ★ {property.average_rating}
            {property.review_count ? ` (${property.review_count})` : ""}
          </span>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-lg font-bold text-text group-hover:text-action">{unit.name}</h3>
          <p className="truncate text-sm font-medium text-text-secondary">{property.title}</p>
        </div>

        {property.location_text ? (
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{property.location_text}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-line/60 bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
            <Users className="size-3" />
            {roomOccupancyLabel(unit, property.room_style)}
          </span>
          {tenant ? (
            <span className="rounded-md border border-navy-200 bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy-900">
              {tenant}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <ShieldCheck className="size-3" />
            {availabilityLabel(unit.available_count, property.room_style)}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line/70 pt-3">
          <p>
            <span className="text-xl font-extrabold text-text">{formatPaise(unit.nightly_rate_paise)}</span>
            <span className="text-xs font-medium text-text-secondary"> / {period === "NIGHT" ? "night" : "month"}</span>
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-action">
            View room
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>

        {moreHere > 0 ? (
          <p className="text-xs font-semibold text-text-link">
            + {moreHere} more room type{moreHere === 1 ? "" : "s"} at {property.title}
          </p>
        ) : null}
      </div>
    </article>
  );
}
