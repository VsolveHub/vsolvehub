"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ShieldCheck, X } from "lucide-react";
import { Skeleton } from "@vsolve/ui";

import { stayHref } from "@/lib/routes";

import {
  formatPaise,
  pricePeriodOf,
  type StayProperty,
  type StayPropertySummary,
} from "../model";
import { fetchStayProperty } from "../queries";
import { StayActionPanel } from "./stay-action-panel";
import { StayImageGallery } from "./stay-image-gallery";

export function StayDetailDrawer({
  property,
  onClose,
}: {
  property: StayProperty | StayPropertySummary;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["stay-property", property.slug],
    queryFn: () => fetchStayProperty(property.slug),
    enabled: Boolean(property.slug),
  });

  const resolvedProperty = detailQuery.data;
  const detailHref = stayHref(property.slug);
  const minRate = property.units.reduce(
    (min, u) => (u.nightly_rate_paise < min ? u.nightly_rate_paise : min),
    property.units[0]?.nightly_rate_paise ?? 0,
  );
  const period = pricePeriodOf(property.price_period);

  return (
    <aside
      aria-labelledby="stay-drawer-heading"
      className="flex h-full min-h-0 w-full lg:w-[400px] shrink-0 flex-col overflow-hidden rounded-t-3xl sm:rounded-[1.25rem] border border-[#e7e2da] bg-white shadow-xl xl:shadow-sm"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e7e2da] px-5 pb-3 pt-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 mb-0.5">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Verified host
          </span>
          <h2
            id="stay-drawer-heading"
            className="text-base font-extrabold leading-snug tracking-tight text-navy-900 line-clamp-2"
          >
            {property.title}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Hosted by <strong className="text-navy-900">{property.host_name}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close stay details"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition-colors hover:bg-[#FAF9F7] hover:text-navy-900"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      {/* Scrollable Gallery + Action Panel */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        {property.media && property.media.length > 0 ? (
          <StayImageGallery
            media={property.media as StayProperty["media"]}
            title={property.title}
            fit="cover"
          />
        ) : null}

        {property.location_text ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#e7e2da] bg-[#FAF9F7] px-3 py-2 text-[12px] text-text-secondary">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#EA580C]" />
            <span>{property.location_text}</span>
          </div>
        ) : null}

        {detailQuery.isLoading || !resolvedProperty ? (
          <div className="space-y-3 pt-1">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
          </div>
        ) : (
          <StayActionPanel property={resolvedProperty} />
        )}
      </div>

      {/* Footer Link */}
      <div className="shrink-0 border-t border-[#e7e2da] bg-white px-5 py-3 flex items-center justify-between gap-3">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Starts at
          </span>
          <span className="text-sm font-extrabold tabular-nums text-navy-900">
            {formatPaise(minRate)}/{period === "NIGHT" ? "night" : "mo"}
          </span>
        </div>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#EA580C] hover:text-[#C2410C]"
        >
          See full property details
          <span aria-hidden>→</span>
        </Link>
      </div>
    </aside>
  );
}

