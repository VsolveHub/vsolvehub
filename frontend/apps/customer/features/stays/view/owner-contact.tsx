"use client";

import Link from "next/link";
import { Building2, Phone } from "lucide-react";

import { formatPhone } from "../model";

/**
 * The owner's name and number with the two things a guest does next: call, or look at the
 * property again. Shown after enquiring and on accepted visits.
 */
export function OwnerContact({
  hostName,
  hostPhone,
  propertySlug,
  onViewProperty,
}: {
  hostName?: string | null;
  hostPhone?: string | null;
  propertySlug?: string | null;
  /** On the property page itself "View property" scrolls up instead of navigating. */
  onViewProperty?: () => void;
}) {
  if (!hostPhone) return null;
  const viewClass =
    "inline-flex flex-1 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-bold text-text hover:border-line-strong";
  return (
    <div className="rounded-control border border-line bg-surface-sunken p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Owner
      </p>
      <p className="mt-0.5 text-sm font-bold text-text">{hostName || "Property owner"}</p>
      <a
        href={`tel:${hostPhone}`}
        className="mt-0.5 block text-base font-extrabold tracking-wide text-action"
      >
        {formatPhone(hostPhone)}
      </a>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`tel:${hostPhone}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-control bg-action px-4 py-2.5 text-sm font-bold text-action-text shadow-sm hover:bg-action-hover"
        >
          <Phone className="size-4" aria-hidden />
          Call
        </a>
        {onViewProperty ? (
          <button type="button" onClick={onViewProperty} className={viewClass}>
            <Building2 className="size-4" aria-hidden />
            View Property
          </button>
        ) : propertySlug ? (
          <Link href={`/stays/${propertySlug}`} className={viewClass}>
            <Building2 className="size-4" aria-hidden />
            View Property
          </Link>
        ) : null}
      </div>
    </div>
  );
}
